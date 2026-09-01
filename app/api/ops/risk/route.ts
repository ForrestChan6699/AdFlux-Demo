import { getD1 } from "../../../../db";

export async function GET() {
  try {
    const d1 = getD1(); const now = new Date(); const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); const stale = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const [invalid, clickWithoutImpression, conversionWithoutClick, rapidConversions, highFrequencyUsers, staleTracking, alerts] = await d1.batch([
      d1.prepare("SELECT COUNT(*) AS count FROM ad_events WHERE created_at>=? AND valid=0").bind(since),
      d1.prepare("SELECT COUNT(*) AS count FROM ad_events c WHERE c.type='click' AND c.created_at>=? AND NOT EXISTS (SELECT 1 FROM ad_events i WHERE i.request_id=c.request_id AND i.type='impression' AND i.valid=1)").bind(since),
      d1.prepare("SELECT COUNT(*) AS count FROM ad_events c WHERE c.type='conversion' AND c.created_at>=? AND NOT EXISTS (SELECT 1 FROM ad_events k WHERE k.request_id=c.request_id AND k.type='click' AND k.valid=1)").bind(since),
      d1.prepare("SELECT COUNT(*) AS count FROM ad_events c JOIN ad_events k ON k.request_id=c.request_id AND k.type='click' WHERE c.type='conversion' AND c.created_at>=? AND (julianday(c.occurred_at)-julianday(k.occurred_at))*86400 < 1").bind(since),
      d1.prepare("SELECT COUNT(*) AS count FROM (SELECT user_id FROM ad_requests WHERE created_at>=? GROUP BY user_id HAVING COUNT(*)>20)").bind(since),
      d1.prepare("SELECT COUNT(*) AS count FROM ad_requests r WHERE r.created_at<? AND r.winner_ad_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ad_events e WHERE e.request_id=r.id AND e.type='impression')").bind(stale),
      d1.prepare("SELECT r.id AS request_id,r.user_id,r.winner_ad_id,r.created_at,'stale_tracking' AS rule FROM ad_requests r WHERE r.created_at<? AND r.winner_ad_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ad_events e WHERE e.request_id=r.id AND e.type='impression') ORDER BY r.created_at DESC LIMIT 20").bind(stale),
    ]);
    const count = (result: { results: unknown[] }) => Number((result.results[0] as { count?: number } | undefined)?.count ?? 0);
    const metrics = { invalidEvents: count(invalid), clickWithoutImpression: count(clickWithoutImpression), conversionWithoutClick: count(conversionWithoutClick), rapidConversions: count(rapidConversions), highFrequencyUsers: count(highFrequencyUsers), staleTracking: count(staleTracking) };
    return Response.json({ generatedAt: now.toISOString(), windowHours: 24, metrics, riskCount: Object.values(metrics).reduce((sum, value) => sum + value, 0), alerts: alerts.results }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}
