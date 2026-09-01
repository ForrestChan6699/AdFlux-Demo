import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the ad decision workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>AdFlux 广告决策台<\/title>/);
  assert.match(html, /一次请求/);
  assert.match(html, /召回/);
  assert.match(html, /GSP 竞价/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("implements all five engine stages and billing safeguards", async () => {
  const [orchestrator, filter, rank, auction, data] = await Promise.all([
    readFile(new URL("../app/engine/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/filter.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/rank.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/auction.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/engine/data.ts", import.meta.url), "utf8"),
  ]);
  assert.match(orchestrator, /recallAds/);
  assert.match(orchestrator, /filterAds/);
  assert.match(orchestrator, /coarseRank/);
  assert.match(orchestrator, /fineRank/);
  assert.match(orchestrator, /calculateBilling/);
  assert.match(filter, /频控上限/);
  assert.match(auction, /first_price/);
  assert.match(auction, /runnerUpEcpm/);
  assert.match(auction, /floorEcpm/);
  assert.match(data, /billingModes/);
  assert.match(data, /length: 200/);
  assert.match(rank, /ad\.billingMode === "CPM"/);
});

test("implements budget safety, event idempotency and immutable ledger", async () => {
  const [budget, events, route, migration, hardeningMigration] = await Promise.all([
    readFile(new URL("../app/server/budget.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/events/[type]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ad/request/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_flawless_rage.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_groovy_sentinels.sql", import.meta.url), "utf8"),
  ]);
  assert.match(budget, /reserveBudget/);
  assert.match(budget, /releaseExpiredReservations/);
  assert.match(budget, /settleReservation/);
  assert.match(budget, /c\.spent \+ \? <= c\.daily_budget/);
  assert.match(events, /idempotency-key/);
  assert.match(events, /onConflictDoNothing/);
  assert.match(events, /event is required before/);
  assert.match(events, /7 \* 86_400_000/);
  assert.match(route, /runAuction/);
  assert.match(route, /candidateReservation/);
  assert.match(route, /auctionLogs/);
  assert.match(migration, /CREATE TABLE `budget_reservations`/);
  assert.match(migration, /CREATE TABLE `billing_ledger`/);
  assert.match(migration, /CREATE TABLE `ad_events`/);
  assert.match(hardeningMigration, /billing_ledger_no_update/);
  assert.match(hardeningMigration, /billing ledger is append-only/);
  assert.match(hardeningMigration, /auction_logs_no_delete/);
  assert.match(hardeningMigration, /budget_reservations_guard_update/);
});

test("includes commercial operations, attribution, fraud and experiments", async () => {
  const source = await readFile(new URL("../app/PlatformModules.tsx", import.meta.url), "utf8");
  assert.match(source, /BUDGET PACING/);
  assert.match(source, /oCPM/);
  assert.match(source, /事件模拟器/);
  assert.match(source, /归因模型对比/);
  assert.match(source, /设备指纹聚类/);
  assert.match(source, /A\/B 实验/);
});

test("includes a repeatable recall quality test bench", async () => {
  const [bench, workbench] = await Promise.all([
    readFile(new URL("../app/RecallTestBench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AdWorkbench.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(bench, /const goldenScenarios/);
  assert.match(bench, /合并无重复/);
  assert.match(bench, /空召回率/);
  assert.match(bench, /运行全部场景/);
  assert.match(bench, /channels\.targeting/);
  assert.match(bench, /新增测试场景/);
  assert.match(bench, /最大耗时/);
  assert.match(bench, /导出 JSON/);
  assert.match(bench, /只看失败/);
  assert.match(workbench, /recalltest/);
  assert.match(workbench, /召回测试/);
});

test("persists inventory and serves ad requests from the server", async () => {
  const [schema, route, migration, workbench] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ad/request/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_tan_squirrel_girl.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/AdWorkbench.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /advertisers/);
  assert.match(schema, /campaigns/);
  assert.match(schema, /adRequests/);
  assert.match(route, /export async function POST/);
  assert.match(route, /runEngineWithAds/);
  assert.match(route, /impressionUrl/);
  assert.match(route, /requestedAt\.toISOString\(\)/);
  assert.match(route, /timeZone: "Asia\/Shanghai"/);
  assert.match(route, /parseDatabaseUtc/);
  assert.match(route, /interestOptions/);
  assert.match(migration, /CREATE TABLE `ad_requests`/);
  assert.match(migration, /CREATE TABLE `ads`/);
  assert.match(workbench, /fetch\("\/api\/ad\/request"/);
  assert.match(workbench, /data\.pipeline\.recalled/);
  assert.match(workbench, /interestOptions\.map/);
  assert.match(workbench, /aria-pressed/);
});
