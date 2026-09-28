import { getD1 } from "../../../db";

export async function GET() {
  try {
    const d1 = getD1();
    const [campaigns, accounts] = await d1.batch([
      d1.prepare(`SELECT c.id,c.name,c.daily_budget,c.spent,c.pacing_mode,c.status,c.created_at,v.id AS advertiser_id,v.name AS advertiser_name,v.balance,v.status AS advertiser_status,COUNT(a.id) AS ad_count,SUM(CASE WHEN a.status='active' THEN 1 ELSE 0 END) AS active_ads FROM campaigns c JOIN advertisers v ON v.id=c.advertiser_id LEFT JOIN ads a ON a.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC`),
      d1.prepare("SELECT v.id,v.name,v.balance,v.status,COUNT(DISTINCT c.id) AS campaign_count,COUNT(a.id) AS ad_count FROM advertisers v LEFT JOIN campaigns c ON c.advertiser_id=v.id LEFT JOIN ads a ON a.campaign_id=c.id GROUP BY v.id ORDER BY v.created_at DESC"),
    ]);
    return Response.json({ campaigns: campaigns.results, accounts: accounts.results }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { id?: string; status?: string; dailyBudget?: number; pacingMode?: string };
    if (!payload.id?.trim()) return Response.json({ error: "campaign id is required" }, { status: 400 });
    if (payload.status === undefined && payload.dailyBudget === undefined && payload.pacingMode === undefined) return Response.json({ error: "status, dailyBudget or pacingMode is required" }, { status: 400 });
    if (payload.status !== undefined && !["active", "paused", "ended"].includes(payload.status)) return Response.json({ error: "invalid campaign status" }, { status: 400 });
    if (payload.pacingMode !== undefined && !["asap", "even"].includes(payload.pacingMode)) return Response.json({ error: "pacingMode must be asap or even" }, { status: 400 });
    if (payload.dailyBudget !== undefined && (!Number.isFinite(payload.dailyBudget) || payload.dailyBudget <= 0 || payload.dailyBudget > 100_000_000)) return Response.json({ error: "dailyBudget is invalid" }, { status: 400 });
    const d1 = getD1(); const operationId = request.headers.get("idempotency-key")?.trim() || `campaign:${crypto.randomUUID()}`;
    if (operationId.length > 128) return Response.json({ error: "idempotency key is too long" }, { status: 400 });
    const existing = await d1.prepare("SELECT id FROM operation_audit_logs WHERE request_id=? LIMIT 1").bind(operationId).first<{ id: string }>();
    if (existing) { const current = await d1.prepare("SELECT id,name,daily_budget,spent,pacing_mode,status FROM campaigns WHERE id=?").bind(payload.id.trim()).first(); return Response.json({ campaign: current, auditId: existing.id, duplicate: true }); }
    const before = await d1.prepare("SELECT id,name,daily_budget,spent,pacing_mode,status FROM campaigns WHERE id=? LIMIT 1").bind(payload.id.trim()).first<Record<string, unknown>>();
    if (!before) return Response.json({ error: "campaign not found" }, { status: 404 });
    if (payload.dailyBudget !== undefined && payload.dailyBudget < Number(before.spent)) return Response.json({ error: "dailyBudget cannot be lower than reserved and charged spend" }, { status: 409 });
    const fields: string[] = []; const bindings: unknown[] = [];
    if (payload.status !== undefined) { fields.push("status=?"); bindings.push(payload.status); }
    if (payload.pacingMode !== undefined) { fields.push("pacing_mode=?"); bindings.push(payload.pacingMode); }
    if (payload.dailyBudget !== undefined) { fields.push("daily_budget=?"); bindings.push(Number(payload.dailyBudget.toFixed(2))); }
    bindings.push(payload.id.trim()); const after = { ...before, ...(payload.status !== undefined ? { status: payload.status } : {}), ...(payload.pacingMode !== undefined ? { pacing_mode: payload.pacingMode } : {}), ...(payload.dailyBudget !== undefined ? { daily_budget: Number(payload.dailyBudget.toFixed(2)) } : {}) }; const now = new Date().toISOString(); const auditId = `op_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
    const [updated] = await d1.batch([
      d1.prepare(`UPDATE campaigns SET ${fields.join(",")} WHERE id=? RETURNING id,name,daily_budget,spent,pacing_mode,status`).bind(...bindings),
      d1.prepare("INSERT INTO operation_audit_logs (id,actor,action,resource_type,resource_id,before_json,after_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(auditId, request.headers.get("x-operator") || "local-console", "update", "campaign", payload.id.trim(), JSON.stringify(before), JSON.stringify(after), operationId, now),
    ]);
    return Response.json({ campaign: updated.results[0], auditId });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}
