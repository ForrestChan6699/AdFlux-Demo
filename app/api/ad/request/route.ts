import { and, desc, eq, like, lt } from "drizzle-orm";
import { getD1, getDb } from "../../../../db";
import { adRequests, ads as adTable, advertisers, auctionLogs, campaigns, experimentAssignments, placements, strategyVersions } from "../../../../db/schema";
import { ads as seedAds, defaultStrategy, interestOptions, interests as defaultInterests, runAuction, runEngineWithDiagnostics, type Ad, type AuctionType, type RequestProfile, type StrategyConfig } from "../../../engine";
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

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 100;
}

function validatePayload(payload: AdRequestPayload): string | null {
  if (!payload.userId?.trim()) return "userId is required";
  if (payload.userId.trim().length > 64) return "userId is too long";
  if (!payload.placementId?.trim()) return "placementId is required";
  if (payload.placementId.trim().length > 64) return "placementId is too long";
  if (payload.requestId && (!/^req_[a-zA-Z0-9_-]{1,80}$/.test(payload.requestId))) return "requestId format is invalid";
  if (!payload.city?.trim()) return "city is required";
  if (payload.city.trim().length > 32) return "city is too long";
  if (!["iOS", "Android"].includes(payload.device ?? "")) return "device must be iOS or Android";
  if (!["信息流", "视频流"].includes(payload.scene ?? "")) return "scene must be 信息流 or 视频流";
  if (payload.interests && (!Array.isArray(payload.interests)
    || payload.interests.some((item) => !interestOptions.includes(item)))) return "interests contains unsupported values";
  if (payload.interests && new Set(payload.interests).size !== payload.interests.length) return "interests contains duplicates";
  if (payload.strategy) {
    const value = payload.strategy;
    if (!Number.isFinite(value.hotCtr) || value.hotCtr < 0 || value.hotCtr > 1) return "strategy.hotCtr is invalid";
    if (!Number.isInteger(value.frequencyCap) || value.frequencyCap < 1 || value.frequencyCap > 100) return "strategy.frequencyCap is invalid";
    if (!Number.isInteger(value.coarseTopK) || value.coarseTopK < 1 || value.coarseTopK > 500) return "strategy.coarseTopK is invalid";
    if (!Number.isInteger(value.fineTopK) || value.fineTopK < 1 || value.fineTopK > value.coarseTopK) return "strategy.fineTopK is invalid";
    if (!value.weights || !["ctr", "quality", "bid", "interest"].every((key) => { const weight = value.weights[key as keyof typeof value.weights]; return Number.isFinite(weight) && weight >= 0 && weight <= 10000; })) return "strategy.weights is invalid";
  }
  return null;
}

async function ensureCanonicalInventory() {
  const db = getDb();
  await db.insert(placements).values([
    { id: "feed_home", name: "首页信息流", auctionType: "gsp", floorEcpm: 8 },
    { id: "video_recommend", name: "推荐视频流", auctionType: "first_price", floorEcpm: 12 },
  ]).onConflictDoNothing();

  await db.insert(advertisers).values({ id: "adv_demo", name: "AdFlux 演示广告主", balance: 1_000_000 }).onConflictDoNothing();
  await db.insert(campaigns).values({ id: "cmp_demo", advertiserId: "adv_demo", name: "全量演示计划", dailyBudget: 500_000 }).onConflictDoNothing();
  const rows = seedAds.map((ad) => ({ ...ad, campaignId: "cmp_demo" }));
  for (let index = 0; index < rows.length; index += 5) {
    await db.insert(adTable).values(rows.slice(index, index + 5)).onConflictDoNothing();
  }
  await db.update(adTable).set({ status: "paused" }).where(like(adTable.id, "local_ad_%"));
}

async function loadInventory(): Promise<Ad[]> {
  const rows = await getDb().select().from(adTable)
    .where(eq(adTable.campaignId, "cmp_demo")).limit(200);
  return rows.map(({ campaignId, createdAt, ...ad }) => { void campaignId; void createdAt; return ad; });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AdRequestPayload;
    const validationError = validatePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await ensureCanonicalInventory();
    await releaseExpiredReservations();
    const db = getDb();
    const [placement] = await db.select().from(placements)
      .where(eq(placements.id, payload.placementId!)).limit(1);
    if (!placement || placement.status !== "active") {
      return Response.json({ error: "placement is unavailable" }, { status: 404 });
    }

    const baseInventory = await loadInventory();
    const requestId = payload.requestId?.trim() || `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const trackingToken = `trk_${crypto.randomUUID().replaceAll("-", "")}`;
    const requestedAt = new Date();
    const profile: RequestProfile = {
      userId: payload.userId!.trim(), city: payload.city!.trim(),
      device: payload.device!, scene: payload.scene!,
      interests: payload.interests ?? defaultInterests,
    };
    const frequencySince = new Date(requestedAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const frequencyResult = await getD1().prepare("SELECT e.ad_id,COUNT(*) AS count FROM ad_events e JOIN ad_requests r ON r.id=e.request_id WHERE r.user_id=? AND e.type='impression' AND e.valid=1 AND e.occurred_at>=? GROUP BY e.ad_id").bind(profile.userId, frequencySince).all<{ ad_id: string; count: number }>();
    const frequencyByAd = new Map(frequencyResult.results.map((row) => [row.ad_id, Number(row.count)]));
    const inventory = baseInventory.map((ad) => ({ ...ad, frequency: frequencyByAd.get(ad.id) ?? 0 }));
    const [activeStrategy] = payload.strategy ? [] : await db.select().from(strategyVersions).where(eq(strategyVersions.status, "active")).limit(1);
    const effectiveStrategy = payload.strategy ?? (activeStrategy?.configJson as unknown as StrategyConfig | undefined) ?? defaultStrategy;
    const bucket = stableBucket(profile.userId); const variant = bucket < 50 ? "control" : "treatment";
    const experimentStrategy = !payload.strategy && variant === "treatment" ? { ...effectiveStrategy, weights: { ...effectiveStrategy.weights, quality: effectiveStrategy.weights.quality * 1.1, interest: effectiveStrategy.weights.interest * 1.15 } } : effectiveStrategy;
    const { result, diagnostics } = runEngineWithDiagnostics(inventory, profile, experimentStrategy);
    const strategyVersion = payload.strategy ? "request_override" : activeStrategy?.id ?? "code_default";

    await db.insert(adRequests).values({
      id: requestId, userId: profile.userId, placementId: placement.id,
      city: profile.city, device: profile.device, scene: profile.scene,
      recalledCount: result.recalled.length, filteredCount: result.filtered.length,
      trackingToken, createdAt: requestedAt.toISOString(),
      resultJson: { coarseCount: result.coarse.length, fineCount: result.fine.length, interests: profile.interests, diagnostics, strategyVersion, experiment: { id: "exp_rank_v4", variant, bucket } },
    });
    await db.insert(experimentAssignments).values({ requestId, experimentId: "exp_rank_v4", userId: profile.userId, variant, bucket, createdAt: requestedAt.toISOString() });

    let auction;
    let reservation;
    let auctionCandidateCount = 0;
    let budgetRejectedCount = 0;
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
      budgetRejectedCount += 1;
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
          interests: profile.interests, diagnostics, strategyVersion, experiment: { id: "exp_rank_v4", variant, bucket },
        },
      }).where(eq(adRequests.id, requestId));
    }

    const origin = new URL(request.url).origin;
    const noFillReason = auction ? null : result.fine.length === 0 ? "no_ranked_candidate" : budgetRejectedCount > 0 ? "budget_unavailable" : "below_floor";
    return Response.json({
      requestId, requestedAt: requestedAt.toISOString(), requestedAtLocal: formatShanghaiTime(requestedAt), strategyVersion,
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
      diagnostics,
      delivery: { filled: !!auction, noFillReason, budgetRejectedCount },
      frequency: { windowHours: 24, exposedAds: frequencyByAd.size },
      experiment: { id: "exp_rank_v4", variant, bucket, applied: !payload.strategy && variant === "treatment" },
      candidates: {
        recalled: result.recalled, rejected: result.rejected,
        filtered: result.filtered, coarse: result.coarse, fine: result.fine,
        billing: auction?.winner,
      },
      tracking: auction ? {
        impressionUrl: `${origin}/api/events/impression?token=${trackingToken}`,
        clickUrl: `${origin}/api/events/click?token=${trackingToken}`,
        conversionUrl: `${origin}/api/events/conversion?token=${trackingToken}`,
      } : null,
    }, { headers: { "cache-control": "no-store", "x-ad-request-id": requestId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: message.includes("UNIQUE constraint failed") ? 409 : 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) return Response.json({ error: "limit must be between 1 and 100" }, { status: 400 });
    const placementId = url.searchParams.get("placementId")?.trim();
    const before = url.searchParams.get("before")?.trim();
    if (before && Number.isNaN(new Date(before).getTime())) return Response.json({ error: "before must be an ISO timestamp" }, { status: 400 });
    const conditions = [placementId ? eq(adRequests.placementId, placementId) : undefined, before ? lt(adRequests.createdAt, new Date(before).toISOString()) : undefined].filter(Boolean);
    const rows = await getDb().select().from(adRequests).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(adRequests.createdAt)).limit(requestedLimit + 1);
    const hasMore = rows.length > requestedLimit; const page = rows.slice(0, requestedLimit);
    return Response.json({ requests: page.map((row) => {
      const createdAt = parseDatabaseUtc(row.createdAt);
      return { ...row, createdAt: createdAt.toISOString(), createdAtLocal: formatShanghaiTime(createdAt), timezone: "Asia/Shanghai" };
    }), page: { limit: requestedLimit, hasMore, nextCursor: hasMore ? page.at(-1)?.createdAt ?? null : null } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
