import { like } from "drizzle-orm";
import { getDb } from "../../db";
import { ads as adTable, advertisers, campaigns, placements } from "../../db/schema";
import { ads as seedAds, type Ad } from "../engine";

// Shared inventory bootstrap: every server entry point that needs the canonical
// demo inventory calls this first, so the D1 pool and the seeded 200 ads stay
// in sync regardless of which route warmed the database.

export async function ensureCanonicalInventory() {
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

export async function loadInventory(): Promise<Ad[]> {
  const rows = await getDb().select().from(adTable);
  return rows.map(({ campaignId, createdAt, ...ad }) => { void campaignId; void createdAt; return ad; });
}
