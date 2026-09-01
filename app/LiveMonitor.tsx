"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";

type RequestRow = { id: string; city: string; device: string; scene: string; recalledCount: number; filteredCount: number; winnerAdId?: string | null; charge?: number | null; clearingEcpm?: number | null; createdAt: string; createdAtLocal?: string };
type Health = { traffic: { requests: number; wins: number; fillRate: number }; inventory: Record<string, { count: number }>; events: Record<string, { count: number }>; status: string; integrity: { issueCount: number } };

export default function LiveMonitor() {
  const [health, setHealth] = useState<Health | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const refresh = async () => {
    try {
      const [healthResponse, requestResponse] = await Promise.all([fetch("/api/ops/health", { cache: "no-store" }), fetch("/api/ad/request", { cache: "no-store" })]);
      const [healthData, requestData] = await Promise.all([healthResponse.json(), requestResponse.json()]);
      if (!healthResponse.ok || !requestResponse.ok) throw new Error(healthData.error || requestData.error || "监控数据获取失败");
      setHealth(healthData); setRequests(requestData.requests ?? []); setUpdatedAt(new Date()); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "监控数据获取失败"); }
  };
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 5_000); return () => window.clearInterval(timer); }, []);
  const metrics = useMemo(() => {
    const filled = requests.filter((item) => item.winnerAdId).length;
    return {
      avgRecall: requests.length ? requests.reduce((sum, item) => sum + item.recalledCount, 0) / requests.length : 0,
      avgFilter: requests.length ? requests.reduce((sum, item) => sum + item.filteredCount, 0) / requests.length : 0,
      recentFill: requests.length ? filled / requests.length : 0,
      avgEcpm: filled ? requests.reduce((sum, item) => sum + Number(item.clearingEcpm ?? 0), 0) / filled : 0,
    };
  }, [requests]);
  const eventTotal = Object.values(health?.events ?? {}).reduce((sum, item) => sum + item.count, 0);
  return <>
    <section className="hero module-hero"><div><div className="eyebrow">OBSERVABILITY / 实时监控</div><h1>每次决策，<em>真实可见</em></h1><p>从 D1 请求日志聚合填充、召回、过滤、清算和事件指标，每 5 秒自动刷新。</p></div><div className={error ? "ops-warning" : "live-badge"}><i/> {error || `LIVE · ${updatedAt?.toLocaleTimeString("zh-CN", { hour12: false }) ?? "连接中"}`}</div></section>
    <section className="monitor live-monitor">
      <div className="kpis"><article><span>24h 请求</span><strong>{health?.traffic.requests ?? "—"}</strong><small>数据库真实记录</small></article><article><span>24h 填充率</span><strong>{health ? `${(health.traffic.fillRate * 100).toFixed(1)}%` : "—"}</strong><small>最近 20 条 {(metrics.recentFill * 100).toFixed(1)}%</small></article><article><span>平均清算 eCPM</span><strong>¥ {metrics.avgEcpm.toFixed(2)}</strong><small>最近已填充请求</small></article><article><span>有效事件</span><strong>{eventTotal}</strong><small>最近 24 小时</small></article></div>
      <div className="monitor-grid"><article className="panel funnel"><div className="panel-head"><div><span className="section-label">REAL FUNNEL</span><h2>近期平均候选漏斗</h2></div><small>最近 {requests.length} 次请求</small></div>{[["广告库存", health?.inventory.active?.count ?? 0], ["平均召回", metrics.avgRecall], ["平均过滤后", metrics.avgFilter], ["平均胜出", metrics.recentFill]].map(([name, value], index, all) => { const base = Number(all[0][1]) || 1; return <div className="funnel-row" key={name}><span>0{index + 1} {name}</span><div><i style={{ width: `${Math.max(2, Number(value) / base * 100)}%` }}/></div><b>{Number(value).toFixed(index ? 1 : 0)}</b><small>{`${(Number(value) / base * 100).toFixed(1)}%`}</small></div>; })}</article><article className="panel event-live"><div className="panel-head"><div><span className="section-label">EVENTS · 24H</span><h2>事件闭环</h2></div></div>{[["曝光", health?.events.impression?.count ?? 0], ["点击", health?.events.click?.count ?? 0], ["转化", health?.events.conversion?.count ?? 0]].map(([name, count]) => <div className="event-live-row" key={name}><span>{name}</span><b>{count}</b><i style={{ width: `${eventTotal ? Number(count) / eventTotal * 100 : 0}%` }}/></div>)}</article><article className="panel requests live-requests"><div className="panel-head"><div><span className="section-label">REQUEST STREAM</span><h2>真实请求流</h2></div><button className="text-button" onClick={refresh}>刷新</button></div>{requests.slice(0, 8).map((item) => <div className="request-row" key={item.id}><code>{item.id}</code><span>{item.city} · {item.device} · {item.scene}</span><b>{item.recalledCount} → {item.filteredCount}</b><em className={item.winnerAdId ? "" : "unfilled"}>{item.winnerAdId ? "已填充" : "未填充"}</em><small>{item.createdAtLocal || new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></div>)}</article></div>
    </section>
  </>;
}
