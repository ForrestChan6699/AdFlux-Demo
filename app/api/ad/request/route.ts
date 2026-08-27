import { count, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adRequests, ads as adTable, advertisers, auctionLogs, campaigns, placements } from "../../../../db/schema";
import { ads as seedAds, runAuction, runEngineWithAds, type Ad, type AuctionType, type RequestProfile, type StrategyConfig } from "../../../engine";
import { releaseExpiredReservations, reserveBudget } from "../../../server/budget";

type AdRequestPayload = Partial<RequestProfile> & {
  placementId?: string; requestId?: string; strategy?: StrategyConfig;
};

function parseDatabaseUtc(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
}

function formatShanghaiTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

function validatePayload(payload: AdRequestPayload): string | null {
  if (!payload.userId?.trim()) return "userId is required";
  if (!payload.placementId?.trim()) return "placementId is required";
  if (!payload.city?.trim()) return "city is required";
  if (!["iOS", "Android"].includes(payload.device ?? "")) return "device must be iOS or Android";
  if (!["信息流", "视频流"].includes(payload.scene ?? "")) return "scene must be 信息流 or 视频流";
  return null;
}

async function seedInventoryIfEmpty() {
  const db = getDb();
  await db.insert(placements).values([
    { id: "feed_home", name: "首页信息流", auctionType: "gsp", floorEcpm: 8 },
    { id: "video_recommend", name: "推荐视频流", auctionType: "first_price", floorEcpm: 12 },
  ]).onConflictDoNothing();

  const [inventory] = await db.select({ value: count() }).from(adTable);
  if (inventory.value > 0) return;
  await db.insert(advertisers).values({ id: "adv_demo", name: "AdFlux 演示广告主", balance: 1_000_000 }).onConflictDoNothing();
  await db.insert(campaigns).values({ id: "cmp_demo", advertiserId: "adv_demo", name: "全量演示计划", dailyBudget: 500_000 }).onConflictDoNothing();
  const rows = seedAds.map((ad) => ({ ...ad, campaignId: "cmp_demo" }));
  for (let index = 0; index < rows.length; index += 5) {
    await db.insert(adTable).values(rows.slice(index, index + 5)).onConflictDoNothing();
  }
}

async function loadInventory(): Promise<Ad[]> {
  const rows = await getDb().select().from(adTable).limit(1000);
  return rows.map(({ campaignId: _campaignId, createdAt: _createdAt, ...ad }) => ad);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AdRequestPayload;
    const validationError = validatePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await seedInventoryIfEmpty();
    await releaseExpiredReservations();
    const db = getDb();
    const [placement] = await db.select().from(placements)
      .where(eq(placements.id, payload.placementId!)).limit(1);
    if (!placement || placement.status !== "active") {
      return Response.json({ error: "placement is unavailable" }, { status: 404 });
    }

    const inventory = await loadInventory();
    const requestId = payload.requestId?.trim() || `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const trackingToken = `trk_${crypto.randomUUID().replaceAll("-", "")}`;
    const requestedAt = new Date();
    const profile: RequestProfile = {
      userId: payload.userId!.trim(), city: payload.city!.trim(),
      device: payload.device!, scene: payload.scene!,
    };
    const result = runEngineWithAds(inventory, profile, payload.strategy);

    await db.insert(adRequests).values({
      id: requestId, userId: profile.userId, placementId: placement.id,
      city: profile.city, device: profile.device, scene: profile.scene,
      recalledCount: result.recalled.length, filteredCount: result.filtered.length,
      trackingToken, createdAt: requestedAt.toISOString(),
      resultJson: { coarseCount: result.coarse.length, fineCount: result.fine.length },
    });

    let auction;
    let reservation;
    let auctionCandidateCount = 0;
    for (let offset = 0; offset < result.fine.length; offset += 1) {
      const candidateAuction = runAuction(
        result.fine.slice(offset), placement.auctionType as AuctionType, placement.floorEcpm,
      );
      if (!candidateAuction) break;
      const candidateReservation = await reserveBudget({
        requestId, adId: candidateAuction.winner.id,
        amount: candidateAuction.eventCharge, chargeEvent: candidateAuction.chargeEvent,
      });
      if (candidateReservation) {
        auction = candidateAuction;
        reservation = candidateReservation;
        auctionCandidateCount = result.fine.length - offset;
        break;
      }
    }

    if (auction) {
      await db.insert(auctionLogs).values({
        id: `auc_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`,
        requestId, placementId: placement.id, auctionType: auction.auctionType,
        winnerAdId: auction.winner.id, runnerUpAdId: auction.runnerUp?.id,
        winnerEcpm: auction.winnerEcpm, runnerUpEcpm: auction.runnerUpEcpm,
        floorEcpm: placement.floorEcpm, clearingEcpm: auction.clearingEcpm,
        chargeEvent: auction.chargeEvent, eventCharge: auction.eventCharge,
        candidateCount: auctionCandidateCount, createdAt: requestedAt.toISOString(),
      });
      await db.update(adRequests).set({
        winnerAdId: auction.winner.id, charge: auction.unitPrice,
        auctionType: auction.auctionType, clearingEcpm: auction.clearingEcpm,
        chargeEvent: auction.chargeEvent,
        resultJson: {
          coarseCount: result.coarse.length, fineCount: result.fine.length,
          billingMode: auction.winner.billingMode, reservationId: reservation?.id,
        },
      }).where(eq(adRequests.id, requestId));
    }

    const origin = new URL(request.url).origin;
    return Response.json({
      requestId, requestedAt: requestedAt.toISOString(), requestedAtLocal: formatShanghaiTime(requestedAt),
      ad: auction ? {
        id: auction.winner.id, brand: auction.winner.brand, title: auction.winner.title,
        category: auction.winner.category, billingMode: auction.winner.billingMode,
        bid: auction.winner.bid, unitPrice: auction.unitPrice, chargeEvent: auction.chargeEvent,
        clearingEcpm: auction.clearingEcpm, predictedCtr: auction.winner.ctr,
        predictedCvr: auction.winner.cvr, ecpm: auction.winner.ecpm,
      } : null,
      auction: auction ? {
        type: auction.auctionType, floorEcpm: placement.floorEcpm,
        winnerEcpm: auction.winnerEcpm, runnerUpEcpm: auction.runnerUpEcpm,
        clearingEcpm: auction.clearingEcpm, candidateCount: auctionCandidateCount,
      } : null,
      budget: reservation ? { reservationId: reservation.id, amount: reservation.amount, status: reservation.status, expiresAt: reservation.expires_at } : null,
      pipeline: { inventory: inventory.length, recalled: result.recalled.length, filtered: result.filtered.length, coarse: result.coarse.length, fine: result.fine.length },
      tracking: auction ? {
        impressionUrl: `${origin}/api/events/impression?token=${trackingToken}`,
        clickUrl: `${origin}/api/events/click?token=${trackingToken}`,
        conversionUrl: `${origin}/api/events/conversion?token=${trackingToken}`,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: message.includes("UNIQUE constraint failed") ? 409 : 500 });
  }
}

export async function GET() {
  try {
    const rows = await getDb().select().from(adRequests).orderBy(desc(adRequests.createdAt)).limit(20);
    return Response.json({ requests: rows.map((row) => {
      const createdAt = parseDatabaseUtc(row.createdAt);
      return { ...row, createdAt: createdAt.toISOString(), createdAtLocal: formatShanghaiTime(createdAt), timezone: "Asia/Shanghai" };
    }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
