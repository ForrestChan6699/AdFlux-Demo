import { getD1 } from "../../../db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const query = url.searchParams.get("q")?.trim() ?? "";
    const conditions: string[] = ["1=1"]; const bindings: unknown[] = [];
    if (status && ["active", "paused"].includes(status)) { conditions.push("a.status = ?"); bindings.push(status); }
    if (query) { conditions.push("(a.id LIKE ? OR a.brand LIKE ? OR a.title LIKE ?)"); bindings.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    const d1 = getD1();
    const statement = d1.prepare(`SELECT a.id,a.brand,a.title,a.category,a.billing_mode,a.bid,a.ctr,a.cvr,a.quality,a.budget,a.frequency,a.status,a.campaign_id,c.name AS campaign_name,c.daily_budget,c.spent,c.status AS campaign_status,v.name AS advertiser_name FROM ads a JOIN campaigns c ON c.id=a.campaign_id JOIN advertisers v ON v.id=c.advertiser_id WHERE ${conditions.join(" AND ")} ORDER BY a.id LIMIT 250`).bind(...bindings);
    const [items, summary, audits] = await d1.batch([statement, d1.prepare("SELECT status,COUNT(*) AS count FROM ads GROUP BY status"), d1.prepare("SELECT * FROM operation_audit_logs WHERE resource_type='ad' ORDER BY created_at DESC LIMIT 20")]);
    return Response.json({ items: items.results, summary: summary.results, audits: audits.results });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { id?: string; status?: string; bid?: number };
    if (!payload.id?.trim()) return Response.json({ error: "ad id is required" }, { status: 400 });
    if (payload.status === undefined && payload.bid === undefined) return Response.json({ error: "status or bid is required" }, { status: 400 });
    if (payload.status !== undefined && !["active", "paused"].includes(payload.status)) return Response.json({ error: "invalid status" }, { status: 400 });
    if (payload.bid !== undefined && (!Number.isFinite(payload.bid) || payload.bid <= 0 || payload.bid > 100000)) return Response.json({ error: "bid must be between 0 and 100000" }, { status: 400 });
    const d1 = getD1();
    const clientOperationId = request.headers.get("idempotency-key")?.trim();
    if (clientOperationId && clientOperationId.length > 128) return Response.json({ error: "idempotency key is too long" }, { status: 400 });
    if (clientOperationId) {
      const existing = await d1.prepare("SELECT id FROM operation_audit_logs WHERE request_id = ? LIMIT 1").bind(clientOperationId).first<{ id: string }>();
      if (existing) {
        const current = await d1.prepare("SELECT id,brand,bid,status FROM ads WHERE id = ? LIMIT 1").bind(payload.id.trim()).first();
        return Response.json({ ad: current, auditId: existing.id, duplicate: true });
      }
    }
    const before = await d1.prepare("SELECT id,brand,bid,status FROM ads WHERE id = ? LIMIT 1").bind(payload.id.trim()).first<Record<string, unknown>>();
    if (!before) return Response.json({ error: "ad not found" }, { status: 404 });
    const fields: string[] = []; const bindings: unknown[] = [];
    if (payload.status !== undefined) { fields.push("status = ?"); bindings.push(payload.status); }
    if (payload.bid !== undefined) { fields.push("bid = ?"); bindings.push(Number(payload.bid.toFixed(4))); }
    bindings.push(payload.id.trim());
    const after = { ...before, ...(payload.status !== undefined ? { status: payload.status } : {}), ...(payload.bid !== undefined ? { bid: Number(payload.bid.toFixed(4)) } : {}) };
    const auditId = `op_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
    const operationId = clientOperationId || `inventory:${auditId}`;
    const [updated] = await d1.batch([
      d1.prepare(`UPDATE ads SET ${fields.join(", ")} WHERE id = ? RETURNING id,brand,bid,status`).bind(...bindings),
      d1.prepare("INSERT INTO operation_audit_logs (id,actor,action,resource_type,resource_id,before_json,after_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(auditId, request.headers.get("x-operator")?.trim() || "local-console", "update", "ad", payload.id.trim(), JSON.stringify(before), JSON.stringify(after), operationId, new Date().toISOString()),
    ]);
    return Response.json({ ad: updated.results[0], auditId, updatedAt: new Date().toISOString() });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}
