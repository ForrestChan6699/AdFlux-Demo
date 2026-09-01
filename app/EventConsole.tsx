"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import type { RankedAd } from "./ad-engine";
import "./modules.css";

type Tracking = { impressionUrl: string; clickUrl: string; conversionUrl: string };
type StoredEvent = { id: string; type: string; occurredAt: string; valid: boolean };

export default function EventConsole({ winner, requestId, tracking }: { winner?: RankedAd; requestId: string; tracking?: Tracking | null }) {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [message, setMessage] = useState("等待真实广告请求");
  const [sending, setSending] = useState("");
  const refresh = async () => {
    if (!requestId.startsWith("req_")) return;
    const response = await fetch(`/api/events?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
    const data = await response.json(); if (response.ok) setEvents(data.events ?? []);
  };
  useEffect(() => { setEvents([]); refresh(); }, [requestId]);
  const fire = async (type: keyof Tracking) => {
    if (!tracking) { setMessage("请先点击右上角“运行请求”获得追踪链接"); return; }
    setSending(type);
    try {
      const response = await fetch(tracking[type], { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `console-${requestId}-${type}` }, body: JSON.stringify({ eventId: `evt_ui_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "事件上报失败");
      setMessage(`${type === "impressionUrl" ? "曝光" : type === "clickUrl" ? "点击" : "转化"}已入库${data.duplicate ? "（幂等命中）" : ""}${data.charged ? "，已触发扣费" : ""}`); await refresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "事件上报失败"); }
    finally { setSending(""); }
  };
  const counts = { impression: events.filter((item) => item.type === "impression").length, click: events.filter((item) => item.type === "click").length, conversion: events.filter((item) => item.type === "conversion").length };
  return <>
    <section className="hero module-hero"><div><div className="eyebrow">EVENTS & ATTRIBUTION / 事件闭环</div><h1>从曝光到转化，<em>真实入库</em></h1><p>使用本次胜出广告的签名追踪链接，上报有序、幂等的曝光、点击和转化事件，并按计费模式触发清算。</p></div><div className={tracking ? "live-badge" : "ops-warning"}><i/> {tracking ? requestId : "尚无可追踪请求"}</div></section>
    <section className="module real-events-layout">
      <article className="panel simulator"><span className="section-label">TRACKING EVENT</span><h2>真实事件模拟器</h2><div className="creative-preview"><i>{winner?.brand?.[0] || "A"}</i><div><b>{winner?.brand || "等待胜出广告"}</b><p>{winner?.title || "先运行一次服务端广告请求"}</p><code>{winner?.id || "—"}</code></div></div><div className="event-actions"><button disabled={!!sending} onClick={() => fire("impressionUrl")}>◎ {sending === "impressionUrl" ? "上报中" : "触发曝光"}</button><button disabled={!!sending} onClick={() => fire("clickUrl")}>↗ {sending === "clickUrl" ? "上报中" : "触发点击"}</button><button disabled={!!sending} className="primary" onClick={() => fire("conversionUrl")}>✓ {sending === "conversionUrl" ? "上报中" : "触发转化"}</button></div><p className="event-message">{message}</p><small>顺序要求：曝光 → 点击 → 转化；重复按钮会命中幂等，不重复扣费。</small></article>
      <article className="panel journey"><span className="section-label">PERSISTED JOURNEY</span><h2>数据库事件路径</h2>{[["可见曝光", counts.impression], ["有效点击", counts.click], ["有效转化", counts.conversion]].map(([name, count], index) => <div className="journey-step" key={name}><i>{index + 1}</i><div><b>{name}</b><small>{Number(count) ? "已完成" : "等待事件"}</small></div><strong>{count}</strong></div>)}<button className="secondary-button" onClick={refresh}>刷新事件</button></article>
      <article className="panel event-records"><div className="panel-head"><div><span className="section-label">EVENT LOG</span><h2>持久化明细</h2></div><span className="mode">7 天归因窗</span></div>{events.length ? events.map((event) => <div className="persisted-event" key={event.id}><i/><div><b>{event.type}</b><code>{event.id}</code></div><span>{new Date(event.occurredAt).toLocaleString("zh-CN", { hour12: false })}</span><em>{event.valid ? "有效" : "无效"}</em></div>) : <div className="empty-test-state">当前请求还没有事件</div>}</article>
    </section>
  </>;
}
