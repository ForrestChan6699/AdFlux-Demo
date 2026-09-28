import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { strategyVersions } from "../../../../db/schema";
import { defaultStrategy, interestOptions, runEngineWithDiagnostics, type RequestProfile, type StrategyConfig } from "../../../engine";
import { ensureCanonicalInventory, loadInventory } from "../../../server/inventory";

type Scenario = { id: string; name: string; profile: RequestProfile };
type Thresholds = { minRecall: number; maxRecall: number; maxLatency: number };

function validate(body: { scenarios?: unknown; thresholds?: unknown }): string | null {
  if (!Array.isArray(body.scenarios) || body.scenarios.length < 1 || body.scenarios.length > 50) return "scenarios must contain between 1 and 50 items";
  for (const scenario of body.scenarios) {
    const value = scenario as Partial<Scenario> & { profile?: Partial<RequestProfile> };
    if (!value.id?.trim() || value.id.length > 80) return "scenario id is required";
    if (!value.name?.trim() || value.name.length > 120) return "scenario name is required";
    const profile = value.profile ?? {};
    if (!profile.userId?.trim() || profile.userId.length > 64) return "scenario profile userId is required";
    if (!profile.city?.trim() || profile.city.length > 32) return "scenario profile city is required";
    if (!["iOS", "Android"].includes(profile.device ?? "")) return "scenario profile device must be iOS or Android";
    if (!["信息流", "视频流"].includes(profile.scene ?? "")) return "scenario profile scene must be 信息流 or 视频流";
    if (profile.interests && (!Array.isArray(profile.interests) || profile.interests.some((item) => !interestOptions.includes(item)))) return "scenario profile interests contains unsupported values";
  }
  const value = body.thresholds as Partial<Thresholds> | undefined;
  if (!value || !Number.isFinite(value.minRecall) || value.minRecall < 0) return "thresholds.minRecall is invalid";
  if (!Number.isFinite(value.maxRecall) || value.maxRecall < value.minRecall) return "thresholds.maxRecall is invalid";
  if (!Number.isFinite(value.maxLatency) || value.maxLatency <= 0) return "thresholds.maxLatency is invalid";
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { scenarios?: Scenario[]; thresholds?: Thresholds };
    const validationError = validate(body);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    await ensureCanonicalInventory();
    const inventory = await loadInventory();
    const [activeStrategy] = await getDb().select().from(strategyVersions)
      .where(eq(strategyVersions.status, "active")).limit(1);
    const effectiveStrategy = (activeStrategy?.configJson as unknown as StrategyConfig | undefined) ?? defaultStrategy;
    const strategyVersion = activeStrategy?.id ?? "code_default";

    const thresholds = body.thresholds!;
    const rows = body.scenarios!.map((scenario) => {
      const started = performance.now();
      const { result, diagnostics } = runEngineWithDiagnostics(inventory, scenario.profile, effectiveStrategy);
      const latencyMs = performance.now() - started;
      const ids = result.recalled.map((ad) => ad.id);
      const channels = {
        targeting: result.recalled.filter((ad) => ad.recall.includes("定向召回")).length,
        interest: result.recalled.filter((ad) => ad.recall.includes("兴趣召回")).length,
        hot: result.recalled.filter((ad) => ad.recall.includes("热门召回")).length,
      };
      const assertions = [
        { label: `召回不少于 ${thresholds.minRecall}`, passed: result.recalled.length >= thresholds.minRecall },
        { label: `召回不超过 ${thresholds.maxRecall}`, passed: result.recalled.length <= thresholds.maxRecall },
        { label: "合并无重复", passed: new Set(ids).size === ids.length },
        { label: `耗时不超过 ${thresholds.maxLatency} ms`, passed: latencyMs <= thresholds.maxLatency },
        { label: `粗排不超过 Top ${effectiveStrategy.coarseTopK}`, passed: result.coarse.length <= effectiveStrategy.coarseTopK },
        { label: `精排不超过 Top ${effectiveStrategy.fineTopK}`, passed: result.fine.length <= effectiveStrategy.fineTopK },
      ];
      return {
        id: scenario.id, name: scenario.name, profile: scenario.profile, passed: assertions.every((item) => item.passed),
        failedAssertions: assertions.filter((item) => !item.passed).map((item) => item.label),
        assertions,
        metrics: {
          recalled: result.recalled.length, filtered: result.filtered.length,
          coarse: result.coarse.length, fine: result.fine.length, latencyMs,
          channels, multiHit: result.recalled.filter((ad) => ad.recall.length > 1).length,
        },
        filterReasons: diagnostics.filterReasons,
      };
    });

    const passCount = rows.filter((row) => row.passed).length;
    return Response.json({
      generatedAt: new Date().toISOString(), inventorySize: inventory.length, strategyVersion,
      summary: {
        total: rows.length, passed: passCount,
        averageRecall: rows.reduce((sum, row) => sum + row.metrics.recalled, 0) / rows.length,
        emptyRate: rows.filter((row) => row.metrics.recalled === 0).length / rows.length * 100,
        averageLatencyMs: rows.reduce((sum, row) => sum + row.metrics.latencyMs, 0) / rows.length,
      },
      rows,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
