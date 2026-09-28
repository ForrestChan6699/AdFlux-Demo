"use client";

import { useMemo, useState } from "react";
import { defaultStrategy, runEngine, type EngineResult, type RequestProfile, type StrategyConfig } from "./ad-engine";
import DecisionLab, { type DecisionDiagnostics } from "./DecisionLab";
import EventAttribution from "./EventConsole";
import ExperimentCenter from "./ExperimentConsole";
import AdvertiserConsole from "./AdvertiserConsole";
import InventoryManager from "./InventoryManager";
import LiveMonitor from "./LiveMonitor";
import OperationsCenter from "./OperationsCenter";
import RecallTestBench from "./RecallTestBench";
import RiskCenter from "./RiskConsole";
import StrategyCenter from "./StrategyCenter";
import "./workbench.css";
import "./billing.css";

type Tracking = { impressionUrl: string; clickUrl: string; conversionUrl: string };
type ServerMeta = {
  requestId: string; counts: number[]; error: string; tracking?: Tracking | null;
  diagnostics?: DecisionDiagnostics;
  delivery?: { filled: boolean; noFillReason: string | null; budgetRejectedCount: number };
};

export default function AdWorkbench() {
  const [tab, setTab] = useState("lab");
  const [request, setRequest] = useState<RequestProfile>({ city: "上海", device: "iOS", scene: "信息流", userId: "u_90382" });
  const [strategy, setStrategy] = useState<StrategyConfig>(defaultStrategy);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(false);
  const [serverResult, setServerResult] = useState<EngineResult | null>(null);
  const [serverMeta, setServerMeta] = useState<ServerMeta>({ requestId: "尚未请求", counts: [], error: "", tracking: null });
  const localResult = useMemo(() => runEngine(request, strategy), [request, strategy]);
  const result = serverResult ?? localResult;

  const run = async () => {
    setTab("lab"); setRunning(true); setActive(0); setServerMeta((current) => ({ ...current, error: "" }));
    try {
      const response = await fetch("/api/ad/request", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, placementId: request.scene === "视频流" ? "video_recommend" : "feed_home", strategy }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "服务端请求失败");
      setServerResult(data.candidates);
      setServerMeta({ requestId: data.requestId, counts: [data.pipeline.recalled, data.pipeline.filtered, data.pipeline.coarse, data.pipeline.fine, data.ad ? 1 : 0], error: "", tracking: data.tracking, diagnostics: data.diagnostics, delivery: data.delivery });
      let stage = 0;
      const timer = window.setInterval(() => { stage += 1; setActive(Math.min(stage, 4)); if (stage >= 4) { window.clearInterval(timer); setRunning(false); } }, 250);
    } catch (reason) {
      setServerMeta((current) => ({ ...current, error: reason instanceof Error ? reason.message : "服务端请求失败" }));
      setRunning(false);
    }
  };

  const counts = serverMeta.counts.length ? serverMeta.counts : [result.recalled.length, result.filtered.length, result.coarse.length, result.fine.length, result.billing ? 1 : 0];
  const pages = {
    lab: <DecisionLab request={request} setRequest={setRequest} result={result} counts={counts} active={active} setActive={setActive} requestId={serverMeta.requestId} error={serverMeta.error} diagnostics={serverMeta.diagnostics} delivery={serverMeta.delivery}/>,
    strategy: <StrategyCenter strategy={strategy} setStrategy={setStrategy}/>,
    campaign: <InventoryManager/>,
    advertiser: <AdvertiserConsole/>,
    events: <EventAttribution winner={result.billing} requestId={serverMeta.requestId} tracking={serverMeta.tracking}/>,
    risk: <RiskCenter/>, experiment: <ExperimentCenter/>, recalltest: <RecallTestBench/>,
    operations: <OperationsCenter/>, monitor: <LiveMonitor/>,
  };
  return <main className="shell"><Header tab={tab} setTab={setTab} run={run} running={running}/>{pages[tab as keyof typeof pages]}<footer><span><i/> 服务端决策、资金与事件链路运行正常</span><span>本地商业广告系统沙盘</span></footer></main>;
}

function Header({ tab, setTab, run, running }: { tab: string; setTab: (value: string) => void; run: () => void; running: boolean }) {
  const nav = [["advertiser", "投放"], ["campaign", "运营"], ["strategy", "策略"], ["lab", "决策"], ["events", "归因"], ["experiment", "实验"], ["recalltest", "召回测试"], ["risk", "风控"], ["operations", "运行健康"], ["monitor", "监控"]];
  return <header className="topbar"><div className="brand-mark">A</div><div className="brand-copy"><strong>AdFlux</strong><span>广告决策台</span></div><nav>{nav.map(([id, name]) => <button key={id} className={tab === id ? "nav-active" : ""} onClick={() => setTab(id)}>{name}</button>)}</nav><div className="status"><i/> 本地运行</div><button className="run-button" onClick={run} disabled={running}>▶ {running ? "决策中…" : "运行请求"}</button></header>;
}
