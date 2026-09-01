"use client";

import { useMemo, useState } from "react";
import { ads, defaultStrategy, interestOptions, runEngine, type RequestProfile } from "./ad-engine";

type Scenario = { id: string; name: string; profile: RequestProfile; builtin?: boolean };
type Thresholds = { minRecall: number; maxRecall: number; maxLatency: number };

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

function executeSuite(scenarios: Scenario[], thresholds: Thresholds) {
  return scenarios.map((scenario) => {
    const started = performance.now();
    const result = runEngine(scenario.profile, defaultStrategy);
    const latency = performance.now() - started;
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
      { label: `耗时不超过 ${thresholds.maxLatency} ms`, passed: latency <= thresholds.maxLatency },
      { label: `粗排不超过 Top ${defaultStrategy.coarseTopK}`, passed: result.coarse.length <= defaultStrategy.coarseTopK },
      { label: `精排不超过 Top ${defaultStrategy.fineTopK}`, passed: result.fine.length <= defaultStrategy.fineTopK },
    ];
    return { ...scenario, result, latency, channels, multiHit: result.recalled.filter((ad) => ad.recall.length > 1).length, assertions, passed: assertions.every((item) => item.passed) };
  });
}

export default function RecallTestBench() {
  const [scenarios, setScenarios] = useState(goldenScenarios);
  const [thresholds, setThresholds] = useState<Thresholds>({ minRecall: 1, maxRecall: 200, maxLatency: 5 });
  const [rows, setRows] = useState(() => executeSuite(goldenScenarios, thresholds));
  const [runs, setRuns] = useState(1);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [draft, setDraft] = useState({ name: "自定义召回场景", city: "上海", device: "iOS", scene: "信息流", interests: [] as string[] });

  const run = (nextScenarios = scenarios) => { setRows(executeSuite(nextScenarios, thresholds)); setRuns((value) => value + 1); };
  const passCount = rows.filter((row) => row.passed).length;
  const visibleRows = onlyFailed ? rows.filter((row) => !row.passed) : rows;
  const avgRecall = rows.reduce((sum, row) => sum + row.result.recalled.length, 0) / Math.max(rows.length, 1);
  const avgLatency = rows.reduce((sum, row) => sum + row.latency, 0) / Math.max(rows.length, 1);
  const emptyRate = rows.filter((row) => row.result.recalled.length === 0).length / Math.max(rows.length, 1) * 100;
  const channelSummary = useMemo(() => [
    ["定向召回", rows.reduce((sum, row) => sum + row.channels.targeting, 0)],
    ["兴趣召回", rows.reduce((sum, row) => sum + row.channels.interest, 0)],
    ["热门召回", rows.reduce((sum, row) => sum + row.channels.hot, 0)],
    ["多通道命中", rows.reduce((sum, row) => sum + row.multiHit, 0)],
  ] as Array<[string, number]>, [rows]);

  const addScenario = () => {
    const id = `custom_${Date.now()}`;
    const next = [...scenarios, { id, name: draft.name.trim() || "自定义召回场景", profile: { userId: id, city: draft.city, device: draft.device, scene: draft.scene, interests: draft.interests } }];
    setScenarios(next); run(next);
  };
  const removeScenario = (id: string) => {
    const next = scenarios.filter((item) => item.id !== id);
    setScenarios(next); run(next);
  };
  const exportReport = () => {
    const report = { generatedAt: new Date().toISOString(), inventorySize: ads.length, thresholds, summary: { total: rows.length, passed: passCount, averageRecall: avgRecall, emptyRate, averageLatencyMs: avgLatency }, cases: rows.map((row) => ({ id: row.id, name: row.name, profile: row.profile, passed: row.passed, failedAssertions: row.assertions.filter((item) => !item.passed).map((item) => item.label), metrics: { recalled: row.result.recalled.length, filtered: row.result.filtered.length, coarse: row.result.coarse.length, fine: row.result.fine.length, latencyMs: row.latency, channels: row.channels, multiHit: row.multiHit } })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `recall-report-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <>
    <section className="hero module-hero"><div><div className="eyebrow">RECALL QA / 召回测试台</div><h1>每条召回，<em>都有证据</em></h1><p>批量回放黄金与自定义请求，检查通道覆盖、去重、候选边界、空召回率与执行耗时。</p></div><div className="recall-actions"><button className="secondary-button" onClick={exportReport}>导出 JSON</button><button className="run-button" onClick={() => run()}>▶ 运行全部场景</button></div></section>
    <section className="module recall-bench">
      <div className="kpis"><article><span>测试场景</span><strong>{rows.length}</strong><small>第 {runs} 次运行</small></article><article><span>断言通过</span><strong>{passCount}/{rows.length}</strong><small>{passCount === rows.length ? "全部通过" : `${rows.length - passCount} 个失败`}</small></article><article><span>平均召回</span><strong>{avgRecall.toFixed(1)}</strong><small>库存 {ads.length}</small></article><article><span>空召回率</span><strong>{emptyRate.toFixed(1)}%</strong><small>目标 0%</small></article></div>
      <div className="recall-config-grid">
        <article className="panel"><div className="panel-head"><div><span className="section-label">ASSERTION POLICY</span><h2>质量门槛</h2></div><span className="latency">平均 {avgLatency.toFixed(3)} ms</span></div><div className="threshold-fields"><label>最少召回<input type="number" min="0" value={thresholds.minRecall} onChange={(event) => setThresholds({ ...thresholds, minRecall: Number(event.target.value) })}/></label><label>最多召回<input type="number" min="1" value={thresholds.maxRecall} onChange={(event) => setThresholds({ ...thresholds, maxRecall: Number(event.target.value) })}/></label><label>最大耗时（ms）<input type="number" min="0.1" step="0.1" value={thresholds.maxLatency} onChange={(event) => setThresholds({ ...thresholds, maxLatency: Number(event.target.value) })}/></label><button className="secondary-button" onClick={() => run()}>应用并测试</button></div></article>
        <article className="panel"><div className="panel-head"><div><span className="section-label">CUSTOM CASE</span><h2>新增测试场景</h2></div></div><div className="custom-case-fields"><label>名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label>城市<select value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })}>{["上海", "北京", "杭州", "广州", "深圳"].map((value) => <option key={value}>{value}</option>)}</select></label><label>设备<select value={draft.device} onChange={(event) => setDraft({ ...draft, device: event.target.value })}>{["iOS", "Android"].map((value) => <option key={value}>{value}</option>)}</select></label><label>场景<select value={draft.scene} onChange={(event) => setDraft({ ...draft, scene: event.target.value })}>{["信息流", "视频流"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="custom-interests">{interestOptions.map((interest) => <button key={interest} aria-pressed={draft.interests.includes(interest)} onClick={() => setDraft({ ...draft, interests: draft.interests.includes(interest) ? draft.interests.filter((item) => item !== interest) : [...draft.interests, interest] })}>{interest}</button>)}</div><button className="secondary-button" onClick={addScenario}>＋ 添加并运行</button></article>
      </div>
      <article className="panel recall-summary"><div className="panel-head"><div><span className="section-label">CHANNEL COVERAGE</span><h2>召回通道覆盖</h2></div></div><div className="recall-channel-bars">{channelSummary.map(([label, value]) => <div key={label}><span>{label}</span><i style={{ width: `${Math.min(100, value / Math.max(rows.length * ads.length, 1) * 100)}%` }}/><b>{value}</b></div>)}</div></article>
      <article className="panel campaign-table"><div className="panel-head"><div><span className="section-label">TEST CASES</span><h2>场景回放结果</h2></div><label className="failure-filter"><input type="checkbox" checked={onlyFailed} onChange={(event) => setOnlyFailed(event.target.checked)}/> 只看失败</label></div><table><thead><tr><th>测试场景</th><th>兴趣</th><th>召回 / 过滤</th><th>通道覆盖</th><th>多通道</th><th>耗时</th><th>断言</th><th>操作</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className={row.passed ? "" : "failed-row"}><td><b>{row.name}</b><small>{row.profile.city} · {row.profile.device} · {row.profile.scene}</small></td><td>{row.profile.interests?.length ? row.profile.interests.join("、") : "无"}</td><td><b>{row.result.recalled.length} / {row.result.filtered.length}</b><small>粗排 {row.result.coarse.length} · 精排 {row.result.fine.length}</small></td><td><small>定向 {row.channels.targeting}</small><small>兴趣 {row.channels.interest}</small><small>热门 {row.channels.hot}</small></td><td>{row.multiHit}</td><td>{row.latency.toFixed(3)} ms</td><td><span className={row.passed ? "pass" : "risk-score"}>{row.passed ? "✓ 通过" : "✕ 失败"}</span>{!row.passed && <small className="failed-reasons">{row.assertions.filter((item) => !item.passed).map((item) => item.label).join("；")}</small>}</td><td>{row.builtin ? <small>黄金用例</small> : <button className="text-button" onClick={() => removeScenario(row.id)}>删除</button>}</td></tr>)}</tbody></table>{visibleRows.length === 0 && <div className="empty-test-state">没有失败场景，当前质量门槛全部满足。</div>}</article>
    </section>
  </>;
}
