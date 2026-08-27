"use client";

import { useState } from "react";
import { ads, defaultStrategy, runEngine, type RequestProfile } from "./ad-engine";

const scenarios: Array<{ name: string; profile: RequestProfile }> = [
  { name: "上海 iOS · 无兴趣", profile: { userId: "recall_01", city: "上海", device: "iOS", scene: "信息流", interests: [] } },
  { name: "上海 iOS · 汽车", profile: { userId: "recall_02", city: "上海", device: "iOS", scene: "信息流", interests: ["汽车"] } },
  { name: "杭州 Android · 旅行户外", profile: { userId: "recall_03", city: "杭州", device: "Android", scene: "信息流", interests: ["旅行", "户外"] } },
  { name: "北京 iOS · 数码教育", profile: { userId: "recall_04", city: "北京", device: "iOS", scene: "信息流", interests: ["数码科技", "教育"] } },
  { name: "上海 Android · 餐饮生活", profile: { userId: "recall_05", city: "上海", device: "Android", scene: "信息流", interests: ["餐饮", "生活"] } },
  { name: "北京 Android · 视频流", profile: { userId: "recall_06", city: "北京", device: "Android", scene: "视频流", interests: ["汽车", "美妆"] } },
  { name: "杭州 iOS · 全兴趣", profile: { userId: "recall_07", city: "杭州", device: "iOS", scene: "信息流", interests: ["数码科技", "旅行", "户外", "餐饮", "汽车", "教育", "生活", "美妆"] } },
  { name: "北京 Android · 无兴趣", profile: { userId: "recall_08", city: "北京", device: "Android", scene: "视频流", interests: [] } },
];

type TestRow = ReturnType<typeof executeSuite>[number];

function executeSuite() {
  return scenarios.map(({ name, profile }) => {
    const started = performance.now();
    const result = runEngine(profile, defaultStrategy);
    const latency = performance.now() - started;
    const ids = result.recalled.map((ad) => ad.id);
    const channels = {
      targeting: result.recalled.filter((ad) => ad.recall.includes("定向召回")).length,
      interest: result.recalled.filter((ad) => ad.recall.includes("兴趣召回")).length,
      hot: result.recalled.filter((ad) => ad.recall.includes("热门召回")).length,
    };
    const multiHit = result.recalled.filter((ad) => ad.recall.length > 1).length;
    const assertions = [
      { label: "存在候选", passed: result.recalled.length > 0 },
      { label: "合并无重复", passed: new Set(ids).size === ids.length },
      { label: "粗排不超过 Top 30", passed: result.coarse.length <= defaultStrategy.coarseTopK },
      { label: "精排不超过 Top 8", passed: result.fine.length <= defaultStrategy.fineTopK },
    ];
    return { name, profile, result, latency, channels, multiHit, assertions, passed: assertions.every((item) => item.passed) };
  });
}

export default function RecallTestBench() {
  const [rows, setRows] = useState<TestRow[]>(() => executeSuite());
  const [runs, setRuns] = useState(1);
  const rerun = () => { setRows(executeSuite()); setRuns((value) => value + 1); };
  const avgRecall = rows.reduce((sum, row) => sum + row.result.recalled.length, 0) / rows.length;
  const avgLatency = rows.reduce((sum, row) => sum + row.latency, 0) / rows.length;
  const emptyRate = rows.filter((row) => row.result.recalled.length === 0).length / rows.length * 100;
  const passCount = rows.filter((row) => row.passed).length;

  return <>
    <section className="hero module-hero"><div><div className="eyebrow">RECALL QA / 召回测试台</div><h1>每条召回，<em>都有证据</em></h1><p>批量回放请求画像，检查通道覆盖、去重、候选截断、空召回率与执行耗时。</p></div><button className="run-button" onClick={rerun}>▶ 运行全部场景</button></section>
    <section className="module recall-bench">
      <div className="kpis">
        <article><span>黄金场景</span><strong>{rows.length}</strong><small>第 {runs} 次运行</small></article>
        <article><span>断言通过</span><strong>{passCount}/{rows.length}</strong><small>{passCount === rows.length ? "全部通过" : "需要检查"}</small></article>
        <article><span>平均召回</span><strong>{avgRecall.toFixed(1)}</strong><small>库存 {ads.length}</small></article>
        <article><span>空召回率</span><strong>{emptyRate.toFixed(1)}%</strong><small>目标 0%</small></article>
      </div>
      <article className="panel recall-summary"><div className="panel-head"><div><span className="section-label">PERFORMANCE</span><h2>批量回放摘要</h2></div><span className="latency">平均 {avgLatency.toFixed(3)} ms</span></div><div className="recall-channel-bars">{[
        ["定向召回", rows.reduce((sum,row)=>sum+row.channels.targeting,0)],
        ["兴趣召回", rows.reduce((sum,row)=>sum+row.channels.interest,0)],
        ["热门召回", rows.reduce((sum,row)=>sum+row.channels.hot,0)],
        ["多通道命中", rows.reduce((sum,row)=>sum+row.multiHit,0)],
      ].map(([label,value])=><div key={label}><span>{label}</span><i style={{width:`${Math.min(100,Number(value)/(rows.length*ads.length)*100)}%`}}/><b>{value}</b></div>)}</div></article>
      <article className="panel campaign-table"><div className="panel-head"><div><span className="section-label">GOLDEN CASES</span><h2>场景回放结果</h2></div><span className={passCount===rows.length?"pass":"risk-score"}>● {passCount===rows.length?"全部通过":"存在失败"}</span></div><table><thead><tr><th>测试场景</th><th>兴趣</th><th>召回 / 过滤</th><th>通道覆盖</th><th>多通道</th><th>耗时</th><th>断言</th></tr></thead><tbody>{rows.map((row)=><tr key={row.name}><td><b>{row.name}</b><small>{row.profile.city} · {row.profile.device} · {row.profile.scene}</small></td><td>{row.profile.interests?.length?row.profile.interests.join("、"):"无"}</td><td><b>{row.result.recalled.length} / {row.result.filtered.length}</b><small>粗排 {row.result.coarse.length} · 精排 {row.result.fine.length}</small></td><td><small>定向 {row.channels.targeting}</small><small>兴趣 {row.channels.interest}</small><small>热门 {row.channels.hot}</small></td><td>{row.multiHit}</td><td>{row.latency.toFixed(3)} ms</td><td><span className={row.passed?"pass":"risk-score"}>{row.passed?"✓ 通过":"✕ 失败"}</span><small>{row.assertions.filter(x=>!x.passed).map(x=>x.label).join("、")}</small></td></tr>)}</tbody></table></article>
    </section>
  </>;
}
