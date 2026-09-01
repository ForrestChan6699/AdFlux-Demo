import { getD1 } from "../../../db";

export async function GET() {
  const started = performance.now();
  try {
    const database = await getD1().prepare("SELECT 1 AS ready").first<{ ready: number }>();
    return Response.json({ status: database?.ready === 1 ? "ready" : "degraded", service: "adflux-engine", database: database?.ready === 1 ? "ready" : "unavailable", checkedAt: new Date().toISOString(), latencyMs: Number((performance.now() - started).toFixed(3)) }, { status: database?.ready === 1 ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "not_ready", service: "adflux-engine", database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
