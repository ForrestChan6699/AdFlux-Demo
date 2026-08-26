import { count, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adRequests, ads as adTable, advertisers, campaigns } from "../../../../db/schema";
import { ads as seedAds, runEngineWithAds, type Ad, type RequestProfile } from "../../../engine";

type AdRequestPayload = Partial<RequestProfile> & { placementId?: string; requestId?: string };

function validatePayload(payload: AdRequestPayload): string | null {
  if (!payload.userId?.trim()) return "userId is required";
  if (!payload.placementId?.trim()) return "placementId is required";
  if (!payload.city?.trim()) return "city is required";
  if (!['iOS', 'Android'].includes(payload.device ?? "")) return "device must be iOS or Android";
  if (!['信息流', '视频流'].includes(payload.scene ?? "")) return "scene must be 信息流 or 视频流";
  return null;
}

async function seedInventoryIfEmpty() {
  const db = getDb();
  const [inventory] = await db.select({ value: count() }).from(adTable);
  if (inventory.value > 0) return;

  await db.insert(advertisers).values({ id: "adv_demo", name: "AdFlux 演示广告主", balance: 1_000_000 }).onConflictDoNothing();
  await db.insert(campaigns).values({ id: "cmp_demo", advertiserId: "adv_demo", name: "全量演示计划", dailyBudget: 500_000 }).onConflictDoNothing();

  const rows = seedAds.map((ad) => ({ ...ad, campaignId: "cmp_demo" }));
  // D1 limits bound parameters per statement. Five rows keep each insert
  // comfortably below that limit while still avoiding one request per ad.
  const seedBatchSize = 5;
  for (let index = 0; index < rows.length; index += seedBatchSize) {
    await db.insert(adTable).values(rows.slice(index, index + seedBatchSize)).onConflictDoNothing();
  }
}

async function loadActiveAds(): Promise<Ad[]> {
  const db = getDb();
  const rows = await db.select().from(adTable).where(eq(adTable.status, "active")).limit(1000);
  return rows.map(({ campaignId: _campaignId, createdAt: _createdAt, ...ad }) => ad);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AdRequestPayload;
    const validationError = validatePayload(payload);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await seedInventoryIfEmpty();
    const inventory = await loadActiveAds();
    const requestId = payload.requestId?.trim() || `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const profile: RequestProfile = {
      userId: payload.userId!.trim(), city: payload.city!.trim(),
      device: payload.device!, scene: payload.scene!,
    };
    const result = runEngineWithAds(inventory, profile);
    const winner = result.billing;
    const origin = new URL(request.url).origin;
    const trackingToken = winner ? btoa(`${requestId}:${winner.id}`) : null;

    await getDb().insert(adRequests).values({
      id: requestId, userId: profile.userId, placementId: payload.placementId!.trim(),
      city: profile.city, device: profile.device, scene: profile.scene,
      recalledCount: result.recalled.length, filteredCount: result.filtered.length,
      winnerAdId: winner?.id, charge: winner?.charge,
      resultJson: { coarseCount: result.coarse.length, fineCount: result.fine.length, billingMode: winner?.billingMode },
    });

    return Response.json({
      requestId,
      ad: winner ? {
        id: winner.id, brand: winner.brand, title: winner.title, category: winner.category,
        billingMode: winner.billingMode, bid: winner.bid, charge: winner.charge,
        predictedCtr: winner.ctr, predictedCvr: winner.cvr, ecpm: winner.ecpm,
      } : null,
      pipeline: { inventory: inventory.length, recalled: result.recalled.length, filtered: result.filtered.length, coarse: result.coarse.length, fine: result.fine.length },
      tracking: winner ? {
        impressionUrl: `${origin}/api/events/impression?token=${encodeURIComponent(trackingToken!)}`,
        clickUrl: `${origin}/api/events/click?token=${encodeURIComponent(trackingToken!)}`,
        conversionToken: trackingToken,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("UNIQUE constraint failed") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    const requests = await getDb().select().from(adRequests).orderBy(desc(adRequests.createdAt)).limit(20);
    return Response.json({ requests });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
