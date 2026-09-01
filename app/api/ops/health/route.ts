import { getD1 } from "../../../../db";
import { releaseExpiredReservations } from "../../../server/budget";

type CountRow = { count: number };
type MetricRow = { key: string; count: number; amount?: number };

export async function GET() {
  try {
    const d1 = getD1();
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [inventory, campaigns, requests, wins, events, reservations, ledger, integrity] = await d1.batch([
      d1.prepare("SELECT status AS key, COUNT(*) AS count FROM ads GROUP BY status"),
      d1.prepare("SELECT status AS key, COUNT(*) AS count, COALESCE(SUM(daily_budget),0) AS amount FROM campaigns GROUP BY status"),
      d1.prepare("SELECT COUNT(*) AS count FROM ad_requests WHERE created_at >= ?").bind(since),
      d1.prepare("SELECT COUNT(*) AS count FROM ad_requests WHERE created_at >= ? AND winner_ad_id IS NOT NULL").bind(since),
      d1.prepare("SELECT type AS key, COUNT(*) AS count FROM ad_events WHERE created_at >= ? AND valid = 1 GROUP BY type").bind(since),
      d1.prepare("SELECT status AS key, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM budget_reservations GROUP BY status"),
      d1.prepare("SELECT type AS key, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM billing_ledger GROUP BY type"),
      d1.prepare(`SELECT
        (SELECT COUNT(*) FROM ads a LEFT JOIN campaigns c ON c.id=a.campaign_id WHERE c.id IS NULL) AS orphan_ads,
        (SELECT COUNT(*) FROM campaigns c LEFT JOIN advertisers v ON v.id=c.advertiser_id WHERE v.id IS NULL) AS orphan_campaigns,
        (SELECT COUNT(*) FROM budget_reservations r LEFT JOIN ad_requests q ON q.id=r.request_id WHERE q.id IS NULL) AS orphan_reservations,
        (SELECT COUNT(*) FROM budget_reservations WHERE status='reserved' AND expires_at < ?) AS expired_reserved,
        (SELECT COUNT(*) FROM campaigns WHERE spent > daily_budget) AS overspent_campaigns,
        (SELECT COUNT(*) FROM advertisers WHERE balance < 0) AS negative_accounts,
        (SELECT CASE WHEN COUNT(*)=1 THEN 0 ELSE 1 END FROM strategy_versions WHERE status='active') AS active_strategy_violation,
        (SELECT COUNT(*) FROM experiment_assignments x LEFT JOIN ad_requests r ON r.id=x.request_id WHERE r.id IS NULL) AS orphan_experiment_assignments`).bind(now.toISOString()),
    ]);

    const keyed = (result: { results?: unknown[] }) => Object.fromEntries(((result.results ?? []) as MetricRow[]).map((row) => [row.key, { count: Number(row.count), amount: Number(row.amount ?? 0) }]));
    const requestCount = Number((requests.results[0] as CountRow | undefined)?.count ?? 0);
    const winCount = Number((wins.results[0] as CountRow | undefined)?.count ?? 0);
    const issues = (integrity.results[0] ?? {}) as Record<string, number>;
    const issueCount = Object.values(issues).reduce((sum, value) => sum + Number(value ?? 0), 0);

    return Response.json({
      generatedAt: now.toISOString(), windowHours: 24,
      traffic: { requests: requestCount, wins: winCount, fillRate: requestCount ? winCount / requestCount : 0 },
      inventory: keyed(inventory), campaigns: keyed(campaigns), events: keyed(events),
      reservations: keyed(reservations), ledger: keyed(ledger),
      integrity: { ...issues, issueCount },
      status: issueCount === 0 ? "healthy" : "warning",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const released = await releaseExpiredReservations();
    return Response.json({ released, reconciledAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
