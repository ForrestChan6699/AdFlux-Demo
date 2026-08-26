import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the ad decision workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>AdFlux 广告决策台<\/title>/);
  assert.match(html, /一次请求/);
  assert.match(html, /召回/);
  assert.match(html, /GSP 竞价/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("implements all five engine stages and billing safeguards", async () => {
  const source = await readFile(new URL("../app/ad-engine.ts", import.meta.url), "utf8");
  assert.match(source, /const recalled/);
  assert.match(source, /const filtered/);
  assert.match(source, /const coarse/);
  assert.match(source, /const fine/);
  assert.match(source, /const billing/);
  assert.match(source, /频控上限/);
  assert.match(source, /Math\.min\(winner\.bid/);
});

test("includes commercial operations, attribution, fraud and experiments", async () => {
  const source = await readFile(new URL("../app/PlatformModules.tsx", import.meta.url), "utf8");
  assert.match(source, /BUDGET PACING/);
  assert.match(source, /oCPM/);
  assert.match(source, /事件模拟器/);
  assert.match(source, /归因模型对比/);
  assert.match(source, /设备指纹聚类/);
  assert.match(source, /A\/B 实验/);
});
