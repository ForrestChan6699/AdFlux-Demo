import { defaultStrategy, type StrategyConfig } from "../../engine";
import { getD1 } from "../../../db";

function validConfig(value: unknown): value is StrategyConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as StrategyConfig;
  return Number.isFinite(config.hotCtr) && config.hotCtr >= 0 && config.hotCtr <= 1
    && Number.isInteger(config.frequencyCap) && config.frequencyCap > 0
    && Number.isInteger(config.coarseTopK) && config.coarseTopK > 0
    && Number.isInteger(config.fineTopK) && config.fineTopK > 0 && config.fineTopK <= config.coarseTopK
    && !!config.weights && Object.values(config.weights).every((weight) => Number.isFinite(weight) && weight >= 0);
}

async function ensureDefault() {
  const d1 = getD1();
  const row = await d1.prepare("SELECT id FROM strategy_versions LIMIT 1").first();
  if (!row) await d1.prepare("INSERT INTO strategy_versions (id,name,status,config_json,created_by,created_at,activated_at) VALUES (?,?,?,?,?,?,?)")
    .bind("strategy_v1", "默认生产策略", "active", JSON.stringify(defaultStrategy), "system", new Date().toISOString(), new Date().toISOString()).run();
}

export async function GET() {
  try { await ensureDefault(); const result = await getD1().prepare("SELECT * FROM strategy_versions ORDER BY created_at DESC LIMIT 30").all(); return Response.json({ versions: result.results }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { name?: string; config?: unknown };
    if (!payload.name?.trim()) return Response.json({ error: "strategy name is required" }, { status: 400 });
    if (!validConfig(payload.config)) return Response.json({ error: "invalid strategy config" }, { status: 400 });
    const id = `strategy_${Date.now().toString(36)}`; const now = new Date().toISOString();
    await getD1().prepare("INSERT INTO strategy_versions (id,name,status,config_json,created_by,created_at) VALUES (?,?,?,?,?,?)").bind(id, payload.name.trim(), "draft", JSON.stringify(payload.config), request.headers.get("x-operator") || "local-console", now).run();
    return Response.json({ version: { id, name: payload.name.trim(), status: "draft", config_json: payload.config, created_at: now } }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { id?: string };
    if (!payload.id?.trim()) return Response.json({ error: "strategy id is required" }, { status: 400 });
    const d1 = getD1(); const target = await d1.prepare("SELECT * FROM strategy_versions WHERE id=? LIMIT 1").bind(payload.id.trim()).first<Record<string, unknown>>();
    if (!target) return Response.json({ error: "strategy not found" }, { status: 404 });
    const operationId = request.headers.get("idempotency-key")?.trim() || `activate:${payload.id}:${Date.now()}`;
    const existing = await d1.prepare("SELECT id FROM operation_audit_logs WHERE request_id=? LIMIT 1").bind(operationId).first<{ id: string }>();
    if (existing) return Response.json({ version: target, auditId: existing.id, duplicate: true });
    const auditId = `op_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`; const now = new Date().toISOString();
    await d1.batch([
      d1.prepare("UPDATE strategy_versions SET status='archived' WHERE status='active' AND id<>?").bind(payload.id.trim()),
      d1.prepare("UPDATE strategy_versions SET status='active',activated_at=? WHERE id=?").bind(now, payload.id.trim()),
      d1.prepare("INSERT INTO operation_audit_logs (id,actor,action,resource_type,resource_id,before_json,after_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(auditId, request.headers.get("x-operator") || "local-console", "activate", "strategy", payload.id.trim(), JSON.stringify({ status: target.status }), JSON.stringify({ status: "active" }), operationId, now),
    ]);
    return Response.json({ version: { ...target, status: "active", activated_at: now }, auditId });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }); }
}
