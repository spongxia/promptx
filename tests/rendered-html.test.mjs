import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PromptLab application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>PromptLab — System Prompt 迭代评估工作台<\/title>/i);
  assert.match(html, /PROMPT/);
  assert.match(html, /LAB/);
  assert.match(html, /定义 System Prompt/);
  assert.match(html, /分配模型角色/);
  assert.match(html, /准备测试集/);
  assert.match(html, /开始优化 System Prompt/);
  assert.match(html, /API Key 不落盘/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes starter artifacts and keeps provider adapters", async () => {
  const [page, layout, packageJson, provider, optimizer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/optimizer.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /openai-responses/);
  assert.match(page, /openai-chat/);
  assert.match(page, /anthropic/);
  assert.match(page, /sameEvaluator/);
  assert.match(page, /自定义测试集/);
  assert.match(page, /自动生成测试集/);
  assert.match(layout, /PromptLab/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(provider, /chat\/completions/);
  assert.match(provider, /responses/);
  assert.match(provider, /anthropic-version/);
  assert.match(optimizer, /TEST ARTIFACTS/);
  assert.match(optimizer, /GENERALIZED EVALUATION JSON/);
  assert.match(optimizer, /Never copy, quote, enumerate, or embed any test input/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
