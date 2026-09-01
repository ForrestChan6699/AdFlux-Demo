"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";

type Bucket = Record<string, { count: number; amount: number }>;
type Health = {
  generatedAt: string; windowHours: number; status: "healthy" | "warning";
  traffic: { requests: number; wins: number; fillRate: number };
  inventory: Bucket; campaigns: Bucket; events: Bucket; reservations: Bucket; ledger: Bucket;
  integrity: Record<string, number> & { issueCount: number };
};
type Trace = { request: Record<string, unknown>; auction: Record<string, unknown> | null; reservations: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; ledger: Array<Record<string, unknown>> };

const money = (value = 0) => `¥ ${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const issueNames: Record<string, string> = { orphan_ads: "无计划广告", orphan_campaigns: "无广告主计划", orphan_reservations: "孤立预算预占", expired_reserved: "过期未释放预占", overspent_campaigns: "超日预算计划", negative_accounts: "负余额账户", active_strategy_violation: "生产策略非唯一", orphan_experiment_assignments: "孤立实验分桶" };

export default function OperationsCenter() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [traceError, setTraceError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try { const response = await fetch("/api/ops/health", { cache: "no-store" }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "健康检查失败"); setData(json); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "健康检查失败"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const timer = window.setInterval(load, 15_000); return () => window.clearInterval(timer); }, []);
  const reconcile = async () => { setLoading(true); const response = await fetch("/api/ops/health", { method: "POST" }); const json = await response.json(); if (!response.ok) setError(json.error || "对账失败"); await load(); };
  const inspect = async () => { setTrace(null); setTraceError(""); if (!requestId.trim()) return; const response = await fetch(`/api/ops/request/${encodeURIComponent(requestId.trim())}`); const json = await response.json(); if (!response.ok) setTraceError(json.error || "查询失败"); else setTrace(json); };
  const eventCount = (type: string) => data?.events[type]?.count ?? 0;
  const impression = eventCount("impression"); const click = eventCount("click"); const conversion = eventCount("conversion");
  return <>
    <section className="hero module-hero"><div><div className="eyebrow">OPERATIONS / 运行健康</div><h1>数据一致，<em>投放才可信</em></h1><p>直接检查真实 D1 库存、请求、事件、预算预占和不可变账本，定位链路断点与资金风险。</p></div><div className={data?.status === "healthy" ? "live-badge" : "ops-warning"}><i/> {loading ? "检查中…" : data?.status === "healthy" ? "系统健康" : "发现数据风险"}</div></section>
    <section className="module ops-health">
      {error && <div className="ops-error">健康接口不可用：{error}<button onClick={load}>重试</button></div>}
      <div className="kpis"><article><span>24h 请求</span><strong>{data?.traffic.requests ?? "—"}</strong><small>真实请求日志</small></article><article><span>填充率</span><strong>{data ? `${(data.traffic.fillRate * 100).toFixed(1)}%` : "—"}</strong><small>{data?.traffic.wins ?? 0} 次竞价胜出</small></article><article><span>在线广告</span><strong>{data?.inventory.active?.count ?? "—"}</strong><small>{data?.inventory.paused?.count ?? 0} 条暂停</small></article><article><span>一致性风险</span><strong>{data?.integrity.issueCount ?? "—"}</strong><small>{data?.status === "healthy" ? "全部检查通过" : "需要处理"}</small></article></div>
      <div className="ops-health-grid">
        <article className="panel"><div className="panel-head"><div><span className="section-label">EVENT FUNNEL · 24H</span><h2>事件闭环</h2></div><button className="text-button" onClick={load}>立即刷新</button></div>{[["曝光", impression, 100], ["点击", click, impression ? click / impression * 100 : 0], ["转化", conversion, click ? conversion / click * 100 : 0]].map(([name, value, rate], index) => <div className="ops-funnel-row" key={name}><span>0{index + 1} {name}</span><i><b style={{ width: `${Math.max(2, Number(rate))}%` }}/></i><strong>{value}</strong><small>{index ? `${Number(rate).toFixed(1)}%` : "基准"}</small></div>)}</article>
        <article className="panel"><div className="panel-head"><div><span className="section-label">BUDGET SAFETY</span><h2>预算预占与清算</h2></div></div>{["reserved", "charged", "released"].map((key) => <div className="ops-money-row" key={key}><span>{{ reserved: "待结算预占", charged: "已扣费", released: "已释放" }[key]}</span><b>{data?.reservations[key]?.count ?? 0} 笔</b><strong>{money(data?.reservations[key]?.amount)}</strong></div>)}<div className="ops-ledger-total"><span>账本记录</span><b>{Object.values(data?.ledger ?? {}).reduce((sum, item) => sum + item.count, 0)} 笔 · 只追加</b></div></article>
        <article className="panel integrity-panel"><div className="panel-head"><div><span className="section-label">DATA INTEGRITY</span><h2>一致性检查</h2></div><div className="integrity-actions"><small>{data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "等待数据"}</small>{Number(data?.integrity.expired_reserved ?? 0) > 0 && <button className="secondary-button" onClick={reconcile}>释放过期预占</button>}</div></div><div className="integrity-grid">{Object.entries(issueNames).map(([key, name]) => { const value = Number(data?.integrity[key] ?? 0); return <div className={value ? "integrity-item bad" : "integrity-item"} key={key}><i>{value ? "!" : "✓"}</i><span>{name}</span><b>{value}</b></div>; })}</div></article>
        <article className="panel request-trace"><div className="panel-head"><div><span className="section-label">REQUEST TRACE</span><h2>请求全链路诊断</h2></div></div><div className="trace-search"><input placeholder="输入 req_..." value={requestId} onChange={(event) => setRequestId(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") inspect(); }}/><button className="secondary-button" onClick={inspect}>查询</button></div>{traceError && <p className="trace-error">{traceError}</p>}{trace && <div className="trace-timeline">{[["请求", trace.request.created_at, `${trace.request.city} · ${trace.request.device} · 召回 ${trace.request.recalled_count}`], ["拍卖", trace.auction?.created_at, trace.auction ? `${trace.auction.auction_type} · 清算 eCPM ${trace.auction.clearing_ecpm}` : "未产生胜出广告"], ["预算", trace.reservations[0]?.created_at, trace.reservations.length ? `${trace.reservations[0].status} · ¥ ${trace.reservations[0].amount}` : "无预算预占"], ["事件", trace.events[0]?.created_at, trace.events.length ? trace.events.map((item) => item.type).join(" → ") : "尚无事件"], ["账本", trace.ledger[0]?.created_at, trace.ledger.length ? `${trace.ledger.length} 条不可变流水` : "尚无流水"]].map(([name, time, detail], index) => <div className="trace-step" key={name}><i>{index + 1}</i><div><b>{name}</b><span>{String(detail)}</span></div><small>{time ? new Date(String(time)).toLocaleString("zh-CN", { hour12: false }) : "—"}</small></div>)}</div>}</article>
      </div>
    </section>
  </>;
}
