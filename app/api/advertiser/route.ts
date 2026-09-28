import { getD1 } from "../../../db";
import { ensureCanonicalInventory } from "../../server/inventory";

export async function GET(request: Request) {
  try {
    await ensureCanonicalInventory();
    const d1 = getD1();
    const url = new URL(request.url);
    const account = url.searchParams.get("account") || "adv_demo";
    const days = url.searchParams.get("days") === "7" ? 7 : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [accounts, campaigns, creatives] = await d1.batch([
      d1.prepare("SELECT id,name,balance,status FROM advertisers ORDER BY created_at"),
      d1.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM ads a WHERE a.campaign_id=c.id) AS ad_count,
        (SELECT COALESCE(SUM(l.amount),0) FROM billing_ledger l WHERE l.campaign_id=c.id AND l.type='charge' AND l.created_at>=?) AS cost,
        (SELECT COUNT(*) FROM ad_events e JOIN ads a ON a.id=e.ad_id WHERE a.campaign_id=c.id AND e.valid=1 AND e.type='impression' AND e.occurred_at>=?) AS impressions,
        (SELECT COUNT(*) FROM ad_events e JOIN ads a ON a.id=e.ad_id WHERE a.campaign_id=c.id AND e.valid=1 AND e.type='click' AND e.occurred_at>=?) AS clicks,
        (SELECT COUNT(*) FROM ad_events e JOIN ads a ON a.id=e.ad_id WHERE a.campaign_id=c.id AND e.valid=1 AND e.type='conversion' AND e.occurred_at>=?) AS conversions
        FROM campaigns c WHERE c.advertiser_id=? ORDER BY c.created_at DESC`).bind(since, since, since, since, account),
      d1.prepare("SELECT a.* FROM ads a JOIN campaigns c ON c.id=a.campaign_id WHERE c.advertiser_id=? ORDER BY a.created_at DESC").bind(account),
    ]);
    return Response.json({ accounts: accounts.results, campaigns: campaigns.results, creatives: creatives.results }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "加载失败" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const p = await request.json();
    const fail = (error: string) => Response.json({ error }, { status: 400 });
    if (!p || typeof p !== "object") return fail("请填写投放信息");
    for (const key of ["account", "name", "brand", "title"]) {
      if (typeof p[key] !== "string" || !p[key].trim() || p[key].length > 100) return fail(`${key} 必须为 1–100 字符`);
    }
    for (const key of ["dailyBudget", "bid"]) {
      if (typeof p[key] !== "number" || !Number.isFinite(p[key]) || p[key] < 0.01 || p[key] > 10000000) return fail(`${key} 金额无效`);
    }
    if (p.bid > 100000) return fail("出价不能超过 100000 元");
    if (!["CPM", "CPC", "CPA", "oCPM"].includes(p.billingMode)) return fail("计费方式无效");
    if (!["active", "paused"].includes(p.status) || !["asap", "even"].includes(p.pacingMode)) return fail("投放状态或速度无效");
    if (!["数码科技", "旅行", "户外", "餐饮", "汽车", "教育", "生活", "美妆"].includes(p.category)) return fail("行业无效");
    for (const [key, allowed] of Object.entries({ regions: ["全国", "上海", "北京", "杭州", "广州", "深圳"], devices: ["iOS", "Android"], scenes: ["信息流", "视频流"] })) {
      if (!Array.isArray(p[key]) || !p[key].length || p[key].length > allowed.length || !p[key].every((v: unknown) => typeof v === "string" && allowed.includes(v)) || new Set(p[key]).size !== p[key].length) return fail(`${key} 定向无效`);
    }
    const key = request.headers.get("idempotency-key");
    if (!key || key.length > 128) return fail("缺少有效的幂等标识");
    const d1 = getD1();
    const existing = await d1.prepare("SELECT after_json FROM operation_audit_logs WHERE request_id=? AND action='create_delivery'").bind(key).first<{ after_json: string }>();
    if (existing) return Response.json({ ...JSON.parse(existing.after_json), duplicate: true });
    const account = await d1.prepare("SELECT id FROM advertisers WHERE id=? AND status='active'").bind(p.account).first();
    if (!account) return fail("广告主账户不存在或已停用");
    const campaignId = `cmp_${crypto.randomUUID().replaceAll("-", "")}`;
    const adId = `ad_${crypto.randomUUID().replaceAll("-", "")}`;
    const result = { campaignId, adId };
    await d1.batch([
      d1.prepare("INSERT INTO campaigns (id,advertiser_id,name,daily_budget,pacing_mode,status) VALUES (?,?,?,?,?,?)").bind(campaignId, p.account, p.name.trim(), p.dailyBudget, p.pacingMode, p.status),
      d1.prepare(`INSERT INTO ads (id,campaign_id,brand,title,category,regions,devices,scenes,billing_mode,bid,ctr,cvr,quality,budget,status) VALUES (?,?,?,?,?,?,?,?,?,?,0.03,0.05,0.8,?,'active')`).bind(adId, campaignId, p.brand.trim(), p.title.trim(), p.category, JSON.stringify(p.regions), JSON.stringify(p.devices), JSON.stringify(p.scenes), p.billingMode, p.bid, p.dailyBudget),
      d1.prepare("INSERT INTO operation_audit_logs (id,actor,action,resource_type,resource_id,after_json,request_id) VALUES (?,?,'create_delivery','campaign',?,?,?)").bind(`op_${crypto.randomUUID()}`, "local-advertiser", campaignId, JSON.stringify(result), key),
    ]);
    return Response.json(result, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof SyntaxError ? "请求格式无效" : error instanceof Error ? error.message : "创建失败" }, { status: error instanceof SyntaxError ? 400 : 500 }); }
}
