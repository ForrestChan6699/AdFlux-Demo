// Behavioral integration tests: import the built Worker and drive the real
// HTTP surface against an in-memory D1 database. These tests verify what the
// system actually does (decision → events → settlement → ledger → audit),
// not just what the source code contains.

import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/cloudflare-workers-shim.mjs", import.meta.url));

const { createTestD1 } = await import("./helpers/test-d1.mjs");

const d1 = await createTestD1();
globalThis.__ADFLUX_TEST_BINDINGS__ = { DB: d1 };

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const workerContext = { waitUntil() {}, passThroughOnException() {} };

function call(path, init) {
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    workerContext,
  );
}

async function postJson(path, body, headers = {}) {
  const response = await call(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function patchJson(path, body, headers = {}) {
  const response = await call(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

const baseProfile = { userId: "u_test_01", placementId: "feed_home", city: "上海", device: "iOS", scene: "信息流" };

test("readiness probe passes once the database binding is live", async () => {
  const response = await call("/api/healthz");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "ready");
  assert.equal(data.database, "ready");
});

test("ad request validates payload before touching the database", async () => {
  const cases = [
    [{ ...baseProfile, userId: "" }, "userId is required"],
    [{ ...baseProfile, device: "HarmonyOS" }, "device must be iOS or Android"],
    [{ ...baseProfile, scene: "音频流" }, "scene must be 信息流 or 视频流"],
    [{ ...baseProfile, interests: ["汽车", "汽车"] }, "interests contains duplicates"],
    [{ ...baseProfile, strategy: { hotCtr: 0.043, frequencyCap: 5, coarseTopK: 10, fineTopK: 20, weights: { ctr: 1, quality: 1, bid: 1, interest: 1 } } }, "strategy.fineTopK is invalid"],
  ];
  for (const [payload, expectedError] of cases) {
    const { response, data } = await postJson("/api/ad/request", payload);
    assert.equal(response.status, 400, `expected 400 for ${expectedError}`);
    assert.equal(data.error, expectedError);
  }
});

test("ad request runs the full decision pipeline and reserves budget", async () => {
  const { response, data } = await postJson("/api/ad/request", baseProfile);
  assert.equal(response.status, 200);
  assert.match(data.requestId, /^req_[a-zA-Z0-9]{6,}$/);
  assert.equal(data.strategyVersion, "code_default");
  assert.equal(data.delivery.filled, true);
  assert.equal(data.delivery.noFillReason, null);
  assert.ok(data.ad.id, "auction must produce a winner");
  assert.ok(data.auction.clearingEcpm >= data.auction.floorEcpm, "clearing price must respect the floor");
  assert.equal(data.budget.status, "reserved");
  assert.ok(data.budget.amount > 0);
  assert.ok(data.tracking.impressionUrl.includes("token="));

  const pipeline = data.pipeline;
  assert.ok(pipeline.recalled >= pipeline.filtered, "funnel must narrow at filtering");
  assert.ok(pipeline.filtered >= pipeline.coarse, "funnel must narrow at coarse ranking");
  assert.ok(pipeline.coarse >= pipeline.fine, "funnel must narrow at fine ranking");
  assert.ok(pipeline.fine >= 1);

  const ledger = await (await call("/api/billing/ledger")).json();
  const reservation = ledger.reservations.find((item) => item.id === data.budget.reservationId);
  assert.equal(reservation.status, "reserved");
  const entry = ledger.ledger.find((item) => item.reservationId === data.budget.reservationId && item.type === "reserve");
  assert.ok(entry, "reserve ledger entry must exist");
  assert.ok(Math.abs(entry.amount - data.budget.amount) < 1e-9, "ledger reserve amount must match the reservation");
  const auctionLog = ledger.auctions.find((item) => item.requestId === data.requestId);
  assert.ok(auctionLog, "auction log must be recorded");
  assert.equal(auctionLog.winnerAdId, data.ad.id);
  const account = ledger.accounts.find((item) => item.id === "adv_demo");
  assert.ok(Math.abs(account.balance - (1_000_000 - data.budget.amount)) < 1e-6, "account balance must drop by exactly the reserved amount");
});

test("events enforce ordering, idempotency and single settlement", async () => {
  const accountsBefore = await (await call("/api/campaigns")).json();
  const balanceBefore = accountsBefore.accounts.find((item) => item.id === "adv_demo").balance;
  const { data: request } = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_events" });
  const token = new URL(request.tracking.impressionUrl).searchParams.get("token");

  const badToken = await call(`/api/events/click?token=invalid_token`);
  assert.equal(badToken.status, 404);

  const earlyClick = await postJson(`/api/events/click?token=${token}`, {}, { "idempotency-key": "click-early" });
  assert.equal(earlyClick.response.status, 409);
  assert.equal(earlyClick.data.requiredEvent, "impression");

  const impression = await postJson(`/api/events/impression?token=${token}`, {}, { "idempotency-key": "imp-1" });
  assert.equal(impression.response.status, 201);
  assert.equal(impression.data.duplicate, false);
  assert.equal(impression.data.charged, request.ad.chargeEvent === "impression");

  const duplicate = await postJson(`/api/events/impression?token=${token}`, {}, { "idempotency-key": "imp-1" });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.data.duplicate, true);
  assert.equal(duplicate.data.charged, false, "duplicate event must never settle twice");

  await postJson(`/api/events/click?token=${token}`, {}, { "idempotency-key": "clk-1" });
  await postJson(`/api/events/conversion?token=${token}`, {}, { "idempotency-key": "cnv-1" });

  const ledger = await (await call("/api/billing/ledger")).json();
  const chargeEntries = ledger.ledger.filter((item) => item.reservationId === request.budget.reservationId && item.type === "charge");
  assert.equal(chargeEntries.length, 1, "exactly one charge entry regardless of event count");
  const reservation = ledger.reservations.find((item) => item.id === request.budget.reservationId);
  assert.equal(reservation.status, "charged");
  const account = ledger.accounts.find((item) => item.id === "adv_demo");
  assert.ok(Math.abs(account.balance - (balanceBefore - request.budget.amount)) < 1e-6, "settled account keeps a single deduction");
});

test("append-only tables reject mutation at the database level", async () => {
  // Row-level BEFORE triggers only fire when a row is matched, so seed one
  // probe row per guarded table before attempting the mutations.
  const { data: seedRequest } = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_immutable" });
  const now = new Date().toISOString();
  d1.sqlite.exec(`INSERT INTO ad_events (id, request_id, ad_id, type, idempotency_key, valid, occurred_at, created_at)
    VALUES ('evt_probe_immutable', '${seedRequest.requestId}', '${seedRequest.ad.id}', 'impression', 'probe:immutable', 1, '${now}', '${now}')`);
  d1.sqlite.exec(`INSERT INTO operation_audit_logs (id, actor, action, resource_type, resource_id, before_json, after_json, request_id, created_at)
    VALUES ('op_probe_immutable', 'probe', 'probe', 'probe', 'probe', '{}', '{}', 'probe:immutable', '${now}')`);

  assert.throws(() => d1.sqlite.exec("UPDATE billing_ledger SET amount = amount + 100"), /append-only/);
  assert.throws(() => d1.sqlite.exec("DELETE FROM billing_ledger WHERE id = (SELECT id FROM billing_ledger LIMIT 1)"), /append-only/);
  assert.throws(() => d1.sqlite.exec("UPDATE ad_events SET valid = 0"), /append-only/);
  assert.throws(() => d1.sqlite.exec("DELETE FROM ad_events"), /append-only/);
  assert.throws(() => d1.sqlite.exec("UPDATE auction_logs SET clearing_ecpm = 0"), /append-only/);
  assert.throws(() => d1.sqlite.exec("DELETE FROM operation_audit_logs"), /append-only/);
  assert.throws(() => d1.sqlite.exec("UPDATE experiment_assignments SET variant = 'control'"), /append-only|immutable/);
});

test("campaign budget floor and ad mutations are guarded by audit idempotency", async () => {
  // Self-sufficient setup: produce one charged campaign spend before asserting.
  const { data: chargeRequest } = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_campaign_floor" });
  const token = new URL(chargeRequest.tracking.impressionUrl).searchParams.get("token");
  await postJson(`/api/events/impression?token=${token}`, {}, { "idempotency-key": "floor-imp" });
  await postJson(`/api/events/click?token=${token}`, {}, { "idempotency-key": "floor-clk" });
  await postJson(`/api/events/conversion?token=${token}`, {}, { "idempotency-key": "floor-cnv" });

  const campaignsBefore = await (await call("/api/campaigns")).json();
  const campaign = campaignsBefore.campaigns.find((item) => item.id === "cmp_demo");
  assert.ok(campaign.spent > 0, "earlier charges must have increased campaign spend");

  const tooLow = await patchJson("/api/campaigns", { id: "cmp_demo", dailyBudget: campaign.spent - 0.01 });
  assert.equal(tooLow.response.status, 409);

  const { data: request } = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_audit" });
  const adId = request.ad.id;
  const originalBid = request.ad.bid;

  const first = await patchJson("/api/inventory", { id: adId, bid: Number((originalBid + 5).toFixed(2)) }, { "idempotency-key": "audit-1", "x-operator": "behavior-test" });
  assert.equal(first.response.status, 200);
  assert.notEqual(first.data.auditId, undefined);

  const replay = await patchJson("/api/inventory", { id: adId, bid: originalBid + 999 }, { "idempotency-key": "audit-1", "x-operator": "behavior-test" });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.data.duplicate, true, "replayed idempotency key must not apply the new bid");

  const inventory = await (await call(`/api/inventory?q=${encodeURIComponent(adId)}`)).json();
  const ad = inventory.items.find((item) => item.id === adId);
  assert.ok(Math.abs(ad.bid - (originalBid + 5)) < 1e-9, "bid must reflect the first operation only");
  const audits = inventory.audits.filter((item) => item.resource_id === adId && item.request_id === "audit-1");
  assert.equal(audits.length, 1, "exactly one audit row per idempotency key");

  await patchJson("/api/inventory", { id: adId, bid: originalBid }, { "idempotency-key": "audit-2" });
});

test("expired reservations are released and funds are returned exactly once", async () => {
  // The health check requires exactly one active production strategy; asking
  // for the strategy list bootstraps the default one.
  await call("/api/strategies");
  const { data: request } = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_expire" });
  const amount = 12.5;
  d1.sqlite.exec(`
    INSERT INTO ad_requests (id, user_id, placement_id, city, device, scene, recalled_count, filtered_count, created_at)
    VALUES ('req_test_expired', 'u_test_expire_helper', 'feed_home', '上海', 'iOS', '信息流', 1, 1, '${new Date().toISOString()}')
  `);
  d1.sqlite.exec(`
    INSERT INTO budget_reservations (id, request_id, advertiser_id, campaign_id, ad_id, amount, charge_event, status, expires_at, created_at)
    VALUES ('rsv_test_expired', 'req_test_expired', 'adv_demo', 'cmp_demo', '${request.ad.id}', ${amount}, 'impression', 'reserved',
      '${new Date(Date.now() - 60_000).toISOString()}', '${new Date(Date.now() - 60_000).toISOString()}')
  `);
  // Mimic the reserve step so the release restores a consistent state.
  d1.sqlite.exec(`UPDATE campaigns SET spent = spent + ${amount} WHERE id = 'cmp_demo'`);
  d1.sqlite.exec(`UPDATE advertisers SET balance = balance - ${amount} WHERE id = 'adv_demo'`);

  const before = await (await call("/api/campaigns")).json();
  const spentBefore = before.campaigns.find((item) => item.id === "cmp_demo").spent;

  const health = await (await call("/api/ops/health")).json();
  assert.ok(health.integrity.expired_reserved >= 1, "expired reservation must be flagged");
  assert.equal(health.status, "warning");

  const release = await postJson("/api/ops/health", {});
  assert.equal(release.response.status, 200);
  assert.ok(release.data.released >= 1);

  const after = await (await call("/api/campaigns")).json();
  const spentAfter = after.campaigns.find((item) => item.id === "cmp_demo").spent;
  assert.ok(Math.abs(spentBefore - spentAfter - amount) < 1e-6, "campaign spend must be refunded by the reserved amount");
  const accountAfter = after.accounts.find((item) => item.id === "adv_demo").balance;
  assert.ok(Math.abs(accountAfter - (before.accounts.find((item) => item.id === "adv_demo").balance + amount)) < 1e-6, "advertiser balance must be refunded");

  const ledger = await (await call("/api/billing/ledger")).json();
  const releaseEntries = ledger.ledger.filter((item) => item.reservationId === "rsv_test_expired" && item.type === "release");
  assert.equal(releaseEntries.length, 1);
  assert.ok(Math.abs(releaseEntries[0].amount + amount) < 1e-9, "release entries carry negative amounts");

  const healthy = await (await call("/api/ops/health")).json();
  assert.equal(healthy.integrity.expired_reserved, 0);
  assert.equal(healthy.status, "healthy");
});

test("user frequency capping filters previously exposed ads within 24 hours", async () => {
  const strategy = { hotCtr: 0.043, frequencyCap: 1, coarseTopK: 30, fineTopK: 8, weights: { ctr: 480, quality: 32, bid: 0.8, interest: 12 } };
  const first = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_freq", strategy });
  assert.equal(first.response.status, 200);
  const token = new URL(first.data.tracking.impressionUrl).searchParams.get("token");
  await postJson(`/api/events/impression?token=${token}`, {}, { "idempotency-key": "freq-imp" });

  const second = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_freq", strategy });
  assert.equal(second.response.status, 200);
  assert.equal(second.data.frequency.exposedAds >= 1, true);
  if (second.data.ad) {
    assert.notEqual(second.data.ad.id, first.data.ad.id, "capped winner must not repeat");
  }
  assert.ok(Object.keys(second.data.diagnostics.filterReasons).some((reason) => reason.includes("频控")), "frequency rejection must be recorded");
});

test("request history supports pagination with validation", async () => {
  const invalid = await call("/api/ad/request?limit=0");
  assert.equal(invalid.status, 400);
  const badBefore = await call("/api/ad/request?before=not-a-date");
  assert.equal(badBefore.status, 400);

  const page = await (await call("/api/ad/request?limit=3")).json();
  assert.equal(page.requests.length, 3);
  assert.ok(page.requests.every((item) => item.id && item.createdAt));
  assert.ok(page.requests[0].createdAt >= page.requests[2].createdAt, "history is newest first");

  const next = await (await call(`/api/ad/request?limit=3&before=${encodeURIComponent(page.requests[2].createdAt)}`)).json();
  assert.ok(!next.requests.some((item) => page.requests.some((seen) => seen.id === item.id)), "cursor pagination must not repeat rows");
});

test("duplicate request ids are rejected with a conflict", async () => {
  const { data: request } = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_conflict", requestId: "req_conflict_probe" });
  assert.equal(request.requestId, "req_conflict_probe");
  const replay = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_conflict", requestId: "req_conflict_probe" });
  assert.equal(replay.response.status, 409);
});

test("even pacing throttles spend to the elapsed-day curve", async () => {
  const invalid = await patchJson("/api/campaigns", { id: "cmp_demo", pacingMode: "turbo" });
  assert.equal(invalid.response.status, 400);

  // Self-sufficient setup: one request reserves budget so campaign spend > 0.
  await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_pacing_seed" });

  // A budget pinned to current spend makes the time-sliced ceiling bind: the
  // campaign may only spend daily_budget * elapsed/1440 so far today, which is
  // strictly below the already-recorded spend for any moment before midnight.
  const before = await (await call("/api/campaigns")).json();
  const spent = before.campaigns.find((item) => item.id === "cmp_demo").spent;
  const tight = Number(spent.toFixed(6));
  await patchJson("/api/campaigns", { id: "cmp_demo", dailyBudget: tight, pacingMode: "even" }, { "idempotency-key": "pacing-1" });

  const throttled = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_pacing" });
  assert.equal(throttled.data.delivery.filled, false);
  assert.equal(throttled.data.delivery.noFillReason, "budget_unavailable");
  assert.ok(throttled.data.delivery.budgetRejectedCount > 0);

  await patchJson("/api/campaigns", { id: "cmp_demo", pacingMode: "asap", dailyBudget: 500_000 }, { "idempotency-key": "pacing-2" });
  const resumed = await postJson("/api/ad/request", { ...baseProfile, userId: "u_test_pacing" });
  assert.equal(resumed.data.delivery.filled, true, "asap pacing only enforces the daily budget cap");
});

test("recall suite replays golden scenarios against live database inventory", async () => {
  const { response, data } = await postJson("/api/ops/recall-suite", {
    scenarios: [
      { id: "probe_01", name: "上海 iOS 无兴趣", profile: { userId: "probe_01", city: "上海", device: "iOS", scene: "信息流", interests: [] } },
      { id: "probe_02", name: "北京 Android 全兴趣", profile: { userId: "probe_02", city: "北京", device: "Android", scene: "视频流", interests: ["汽车", "美妆"] } },
    ],
    thresholds: { minRecall: 1, maxRecall: 200, maxLatency: 50 },
  });
  assert.equal(response.status, 200);
  assert.equal(data.inventorySize, 200);
  assert.equal(data.rows.length, 2);
  for (const row of data.rows) {
    assert.equal(row.passed, true, `scenario ${row.id} should pass: ${JSON.stringify(row.failedAssertions)}`);
    assert.ok(row.metrics.recalled >= 1);
    assert.ok(row.assertions.length >= 6);
  }
});

test("advertiser delivery persists, deduplicates and participates in targeting", async () => {
  const payload = { account: "adv_demo", name: "Advertiser test", brand: "Test brand", title: "New delivery", dailyBudget: 10000, bid: 1000, billingMode: "CPM", pacingMode: "asap", status: "active", category: "数码科技", regions: ["深圳"], devices: ["iOS"], scenes: ["信息流"] };
  const invalid = await postJson("/api/advertiser", { ...payload, devices: [] }, { "idempotency-key": "delivery-invalid" });
  assert.equal(invalid.response.status, 400);
  const created = await postJson("/api/advertiser", payload, { "idempotency-key": "delivery-test" });
  assert.equal(created.response.status, 201);
  const duplicate = await postJson("/api/advertiser", payload, { "idempotency-key": "delivery-test" });
  assert.equal(duplicate.data.campaignId, created.data.campaignId);
  assert.equal(duplicate.data.duplicate, true);
  const report = await (await call("/api/advertiser?account=adv_demo&days=7")).json();
  assert.ok(report.campaigns.some((c) => c.id === created.data.campaignId));
  assert.ok(report.creatives.some((a) => a.id === created.data.adId));
  const request = await postJson("/api/ad/request", { ...baseProfile, city: "深圳", userId: "delivery-test-user" });
  assert.ok(request.data.candidates.filtered.some((a) => a.id === created.data.adId), "new advertiser creative enters live decision inventory");
  const otherCity = await postJson("/api/ad/request", { ...baseProfile, city: "北京", userId: "delivery-test-other" });
  assert.ok(!otherCity.data.candidates.filtered.some((a) => a.id === created.data.adId));
  await patchJson("/api/inventory", { id: created.data.adId, status: "paused" });
  const paused = await postJson("/api/ad/request", { ...baseProfile, city: "深圳", userId: "delivery-test-paused" });
  assert.ok(!paused.data.candidates.filtered.some((a) => a.id === created.data.adId));
});
