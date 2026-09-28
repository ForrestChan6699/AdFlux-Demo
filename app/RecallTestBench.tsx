"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useCallback, useEffect, useState } from "react";
import { interestOptions, type RequestProfile } from "./ad-engine";

type Scenario = { id: string; name: string; profile: RequestProfile; builtin?: boolean };
type Thresholds = { minRecall: number; maxRecall: number; maxLatency: number };
type Assertion = { label: string; passed: boolean };
type SuiteRow = {
  id: string; name: string; profile: RequestProfile; passed: boolean;
  failedAssertions: string[]; assertions: Assertion[];
  metrics: {
    recalled: number; filtered: number; coarse: number; fine: number; latencyMs: number;
    channels: { targeting: number; interest: number; hot: number }; multiHit: number;
  };
  filterReasons: Record<string, number>;
};
type SuiteMeta = { inventorySize: number; strategyVersion: string; generatedAt: string };

const goldenScenarios: Scenario[] = [
  { id: "recall_01", name: "上海 iOS · 无兴趣", profile: { userId: "recall_01", city: "上海", device: "iOS", scene: "信息流", interests: [] }, builtin: true },
  { id: "recall_02", name: "上海 iOS · 汽车", profile: { userId: "recall_02", city: "上海", device: "iOS", scene: "信息流", interests: ["汽车"] }, builtin: true },
  { id: "recall_03", name: "杭州 Android · 旅行户外", profile: { userId: "recall_03", city: "杭州", device: "Android", scene: "信息流", interests: ["旅行", "户外"] }, builtin: true },
  { id: "recall_04", name: "北京 iOS · 数码教育", profile: { userId: "recall_04", city: "北京", device: "iOS", scene: "信息流", interests: ["数码科技", "教育"] }, builtin: true },
  { id: "recall_05", name: "上海 Android · 餐饮生活", profile: { userId: "recall_05", city: "上海", device: "Android", scene: "信息流", interests: ["餐饮", "生活"] }, builtin: true },
  { id: "recall_06", name: "北京 Android · 视频流", profile: { userId: "recall_06", city: "北京", device: "Android", scene: "视频流", interests: ["汽车", "美妆"] }, builtin: true },
  { id: "recall_07", name: "杭州 iOS · 全兴趣", profile: { userId: "recall_07", city: "杭州", device: "iOS", scene: "信息流", interests: interestOptions }, builtin: true },
  { id: "recall_08", name: "北京 Android · 无兴趣", profile: { userId: "recall_08", city: "北京", device: "Android", scene: "视频流", interests: [] }, builtin: true },
];

export default function RecallTestBench() {
  const [scenarios, setScenarios] = useState(goldenScenarios);
  const [thresholds, setThresholds] = useState<Thresholds>({ minRecall: 1, maxRecall: 200, maxLatency: 50 });
  const [rows, setRows] = useState<SuiteRow[]>([]);
  const [meta, setMeta] = useState<SuiteMeta | null>(null);
  const [runs, setRuns] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [draft, setDraft] = useState({ name: "自定义召回场景", city: "上海", device: "iOS", scene: "信息流", interests: [] as string[] });

  const run = useCallback(async (nextScenarios: Scenario[], nextThresholds: Thresholds) => {
    setRunning(true); setError("");
    try {
      const response = await fetch("/api/ops/recall-suite", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarios: nextScenarios, thresholds: nextThresholds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "服务端回放失败");
      setRows(data.rows);
      setMeta({ inventorySize: data.inventorySize, strategyVersion: data.strategyVersion, generatedAt: data.generatedAt });
      setRuns((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "服务端回放失败");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => { void run(goldenScenarios, { minRecall: 1, maxRecall: 200, maxLatency: 50 }); }, [run]);

  const passCount = rows.filter((row) => row.passed).length;
  const visibleRows = onlyFailed ? rows.filter((row) => !row.passed) : rows;
  const inventorySize = meta?.inventorySize ?? 0;
  const avgRecall = rows.reduce((sum, row) => sum + row.metrics.recalled, 0) / Math.max(rows.length, 1);
  const avgLatency = rows.reduce((sum, row) => sum + row.metrics.latencyMs, 0) / Math.max(rows.length, 1);
  const emptyRate = rows.filter((row) => row.metrics.recalled === 0).length / Math.max(rows.length, 1) * 100;
  const channelSummary = [
    ["定向召回", rows.reduce((sum, row) => sum + row.metrics.channels.targeting, 0)],
    ["兴趣召回", rows.reduce((sum, row) => sum + row.metrics.channels.interest, 0)],
    ["热门召回", rows.reduce((sum, row) => sum + row.metrics.channels.hot, 0)],
    ["多通道命中", rows.reduce((sum, row) => sum + row.metrics.multiHit, 0)],
  ] as Array<[string, number]>;

  const addScenario = () => {
    const id = `custom_${Date.now()}`;
    const next = [...scenarios, { id, name: draft.name.trim() || "自定义召回场景", profile: { userId: id, city: draft.city, device: draft.device, scene: draft.scene, interests: draft.interests } }];
    setScenarios(next); void run(next, thresholds);
  };
  const removeScenario = (id: string) => {
    const next = scenarios.filter((item) => item.id !== id);
    setScenarios(next); void run(next, thresholds);
  };
  const exportReport = () => {
    const report = { generatedAt: new Date().toISOString(), replay: meta, thresholds, summary: { total: rows.length, passed: passCount, averageRecall: avgRecall, emptyRate, averageLatencyMs: avgLatency }, cases: rows.map((row) => ({ id: row.id, name: row.name, profile: row.profile, passed: row.passed, failedAssertions: row.failedAssertions, metrics: row.metrics, filterReasons: row.filterReasons })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `recall-report-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <>
    <section className="hero module-hero"><div><div className="eyebrow">RECALL QA / 召回测试台</div><h1>每条召回，<em>都有证据</em></h1><p>批量回放黄金与自定义请求，检查通道覆盖、去重、候选边界、空召回率与执行耗时。回放基于 D1 真实库存与生产策略版本执行。</p></div><div className="recall-actions"><button className="secondary-button" onClick={exportReport}>导出 JSON</button><button className="run-button" onClick={() => void run(scenarios, thresholds)} disabled={running}>▶ {running ? "回放中…" : "运行全部场景"}</button></div></section>
    <section className="module recall-bench">
      <div className="kpis"><article><span>测试场景</span><strong>{rows.length}</strong><small>第 {runs} 次回放{meta ? ` · 策略 ${meta.strategyVersion}` : ""}</small></article><article><span>断言通过</span><strong>{passCount}/{rows.length}</strong><small>{rows.length && passCount === rows.length ? "全部通过" : `${rows.length - passCount} 个失败`}</small></article><article><span>平均召回</span><strong>{avgRecall.toFixed(1)}</strong><small>D1 库存 {inventorySize}</small></article><article><span>空召回率</span><strong>{emptyRate.toFixed(1)}%</strong><small>目标 0%</small></article></div>
      {error && <div className="failed-reasons">服务端回放失败：{error}</div>}
      <div className="recall-config-grid">
        <article className="panel"><div className="panel-head"><div><span className="section-label">ASSERTION POLICY</span><h2>质量门槛</h2></div><span className="latency">服务端平均 {avgLatency.toFixed(3)} ms</span></div><div className="threshold-fields"><label>最少召回<input type="number" min="0" value={thresholds.minRecall} onChange={(event) => setThresholds({ ...thresholds, minRecall: Number(event.target.value) })}/></label><label>最多召回<input type="number" min="1" value={thresholds.maxRecall} onChange={(event) => setThresholds({ ...thresholds, maxRecall: Number(event.target.value) })}/></label><label>最大耗时（ms）<input type="number" min="0.1" step="0.1" value={thresholds.maxLatency} onChange={(event) => setThresholds({ ...thresholds, maxLatency: Number(event.target.value) })}/></label><button className="secondary-button" onClick={() => void run(scenarios, thresholds)} disabled={running}>应用并测试</button></div></article>
        <article className="panel"><div className="panel-head"><div><span className="section-label">CUSTOM CASE</span><h2>新增测试场景</h2></div></div><div className="custom-case-fields"><label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label>城市<select value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })}>{["上海", "北京", "杭州", "广州", "深圳"].map((value) => <option key={value}>{value}</option>)}</select></label><label>设备<select value={draft.device} onChange={(event) => setDraft({ ...draft, device: event.target.value })}>{["iOS", "Android"].map((value) => <option key={value}>{value}</option>)}</select></label><label>场景<select value={draft.scene} onChange={(event) => setDraft({ ...draft, scene: event.target.value })}>{["信息流", "视频流"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="custom-interests">{interestOptions.map((interest) => <button key={interest} aria-pressed={draft.interests.includes(interest)} onClick={() => setDraft({ ...draft, interests: draft.interests.includes(interest) ? draft.interests.filter((item) => item !== interest) : [...draft.interests, interest] })}>{interest}</button>)}</div><button className="secondary-button" onClick={addScenario}>＋ 添加并运行</button></article>
      </div>
      <article className="panel recall-summary"><div className="panel-head"><div><span className="section-label">CHANNEL COVERAGE</span><h2>召回通道覆盖</h2></div>{meta && <small className="latency">回放于 {new Date(meta.generatedAt).toLocaleTimeString("zh-CN")}</small>}</div><div className="recall-channel-bars">{channelSummary.map(([label, value]) => <div key={label}><span>{label}</span><i style={{ width: `${Math.min(100, value / Math.max(rows.length * inventorySize, 1) * 100)}%` }}/><b>{value}</b></div>)}</div></article>
      <article className="panel campaign-table"><div className="panel-head"><div><span className="section-label">TEST CASES</span><h2>场景回放结果</h2></div><label className="failure-filter"><input type="checkbox" checked={onlyFailed} onChange={(event) => setOnlyFailed(event.target.checked)}/> 只看失败</label></div><table><thead><tr><th>测试场景</th><th>兴趣</th><th>召回 / 过滤</th><th>通道覆盖</th><th>多通道</th><th>耗时</th><th>断言</th><th>操作</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className={row.passed ? "" : "failed-row"}><td><b>{row.name}</b><small>{row.profile.city} · {row.profile.device} · {row.profile.scene}</small></td><td>{row.profile.interests?.length ? row.profile.interests.join("、") : "无"}</td><td><b>{row.metrics.recalled} / {row.metrics.filtered}</b><small>粗排 {row.metrics.coarse} · 精排 {row.metrics.fine}</small></td><td><small>定向 {row.metrics.channels.targeting}</small><small>兴趣 {row.metrics.channels.interest}</small><small>热门 {row.metrics.channels.hot}</small></td><td>{row.metrics.multiHit}</td><td>{row.metrics.latencyMs.toFixed(3)} ms</td><td><span className={row.passed ? "pass" : "risk-score"}>{row.passed ? "✓ 通过" : "✕ 失败"}</span>{!row.passed && <small className="failed-reasons">{row.failedAssertions.join("；")}</small>}</td><td>{scenarios.find((item) => item.id === row.id)?.builtin ? <small>黄金用例</small> : <button className="text-button" onClick={() => removeScenario(row.id)}>删除</button>}</td></tr>)}</tbody></table>{visibleRows.length === 0 && <div className="empty-test-state">{rows.length === 0 ? "尚未执行回放。" : "没有失败场景，当前质量门槛全部满足。"}</div>}</article>
    </section>
  </>;
}
