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
  assert.match(html, /拍卖清算/);
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

test("includes database-backed commercial operations and experiments", async () => {
  const [campaigns, events, risk, experiment, placements] = await Promise.all([
    readFile(new URL("../app/CampaignPortfolio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/EventConsole.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RiskConsole.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ExperimentConsole.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PlacementManager.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(campaigns, /真实投放计划/);
  assert.match(events, /真实事件模拟器/);
  assert.match(risk, /真实异常请求/);
  assert.match(experiment, /稳定分桶/);
  assert.match(placements, /广告位与拍卖规则/);
});

test("includes a repeatable recall quality test bench", async () => {
  const [bench, workbench] = await Promise.all([
    readFile(new URL("../app/RecallTestBench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AdWorkbench.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(bench, /const goldenScenarios/);
  assert.match(bench, /api\/ops\/recall-suite/);
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
  const [schema, route, migration, workbench, lab] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ad/request/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_tan_squirrel_girl.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/AdWorkbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/DecisionLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /advertisers/);
  assert.match(schema, /campaigns/);
  assert.match(schema, /adRequests/);
  assert.match(route, /export async function POST/);
  assert.match(route, /runEngineWithDiagnostics/);
  assert.match(route, /impressionUrl/);
  assert.match(route, /requestedAt\.toISOString\(\)/);
  assert.match(route, /timeZone: "Asia\/Shanghai"/);
  assert.match(route, /parseDatabaseUtc/);
  assert.match(route, /nextCursor/);
  assert.match(route, /limit must be between 1 and 100/);
  assert.match(route, /interestOptions/);
  assert.match(migration, /CREATE TABLE `ad_requests`/);
  assert.match(migration, /CREATE TABLE `ads`/);
  assert.match(workbench, /fetch\("\/api\/ad\/request"/);
  assert.match(workbench, /data\.pipeline\.recalled/);
  assert.match(lab, /interestOptions\.map/);
  assert.match(lab, /aria-pressed/);
});

test("provides real operations health, tracing and event consoles", async () => {
  const [health, trace, operations, events, monitor] = await Promise.all([
    readFile(new URL("../app/api/ops/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ops/request/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/OperationsCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/EventConsole.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LiveMonitor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(health, /expired_reserved/);
  assert.match(health, /releaseExpiredReservations/);
  assert.match(trace, /auction_logs/);
  assert.match(trace, /billing_ledger/);
  assert.match(operations, /请求全链路诊断/);
  assert.match(events, /idempotency-key/);
  assert.match(events, /真实事件模拟器/);
  assert.match(monitor, /真实请求流/);
  assert.match(monitor, /setInterval\(refresh, 5_000\)/);
});

test("provides diagnosed decisions and audited inventory operations", async () => {
  const [engine, request, inventory, manager, migration] = await Promise.all([
    readFile(new URL("../app/engine/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ad/request/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/inventory/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/InventoryManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_fast_karma.sql", import.meta.url), "utf8"),
  ]);
  assert.match(engine, /runEngineWithDiagnostics/);
  assert.match(engine, /filterReasons/);
  assert.match(request, /diagnostics/);
  assert.match(inventory, /idempotency-key/);
  assert.match(inventory, /operation_audit_logs/);
  assert.match(manager, /修改即生效/);
  assert.match(manager, /最近操作审计/);
  assert.match(migration, /operation_audit_logs_no_update/);
  assert.match(migration, /operation audit log is append-only/);
});

test("governs strategies, placements, campaigns and stable experiments", async () => {
  const [strategies, placements, campaigns, request, experiments, migration] = await Promise.all([
    readFile(new URL("../app/api/strategies/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/placements/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ad/request/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/experiments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_closed_mister_sinister.sql", import.meta.url), "utf8"),
  ]);
  assert.match(strategies, /strategy_versions/);
  assert.match(placements, /floor_ecpm/);
  assert.match(campaigns, /dailyBudget cannot be lower/);
  assert.match(campaigns, /pacingMode must be asap or even/);
  assert.match(request, /stableBucket/);
  assert.match(request, /frequencyByAd/);
  assert.match(experiments, /experiment_assignments/);
  assert.match(migration, /experiment_assignments_no_update/);
});

test("exposes a database-backed readiness probe", async () => {
  const source = await readFile(new URL("../app/api/healthz/route.ts", import.meta.url), "utf8");
  assert.match(source, /SELECT 1 AS ready/);
  assert.match(source, /status: 503/);
  assert.match(source, /cache-control/);
});
