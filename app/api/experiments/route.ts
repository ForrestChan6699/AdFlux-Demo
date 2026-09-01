import { getD1 } from "../../../db";

export async function GET() {
  try {
    const result = await getD1().prepare(`SELECT x.variant,
      COUNT(*) AS requests,
      SUM(CASE WHEN r.winner_ad_id IS NOT NULL THEN 1 ELSE 0 END) AS wins,
      AVG(CASE WHEN r.winner_ad_id IS NOT NULL THEN r.clearing_ecpm END) AS avg_ecpm,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM ad_events e WHERE e.request_id=r.id AND e.type='impression' AND e.valid=1) THEN 1 ELSE 0 END) AS impressions,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM ad_events e WHERE e.request_id=r.id AND e.type='click' AND e.valid=1) THEN 1 ELSE 0 END) AS clicks,
      SUM(CASE WHEN EXISTS(SELECT 1 FROM ad_events e WHERE e.request_id=r.id AND e.type='conversion' AND e.valid=1) THEN 1 ELSE 0 END) AS conversions
      FROM experiment_assignments x JOIN ad_requests r ON r.id=x.request_id
      WHERE x.experiment_id='exp_rank_v4' GROUP BY x.variant ORDER BY x.variant`).all();
    return Response.json({ experiment: { id: "exp_rank_v4", name: "精排质量与兴趣权重增强", allocation: { control: 50, treatment: 50 }, status: "running" }, variants: result.results }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}
