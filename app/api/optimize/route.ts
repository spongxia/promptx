import { isProtocol, ProviderConfig } from "../../../lib/provider";
import { optimizePrompt, TestSetup } from "../../../lib/optimizer";

export const runtime = "edge";

type RawConfig = {
  protocol?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
};

type RequestPayload = {
  optimizer?: unknown;
  evaluator?: unknown;
  requirement?: unknown;
  criteria?: unknown;
  rounds?: unknown;
  testSetup?: unknown;
};

function providerConfig(value: unknown, label: string): ProviderConfig {
  if (!value || typeof value !== "object") throw new Error(`${label}配置缺失。`);
  const raw = value as RawConfig;
  if (!isProtocol(raw.protocol)) throw new Error(`${label}使用了不支持的 API 协议。`);
  if (typeof raw.baseUrl !== "string" || !raw.baseUrl.trim()) throw new Error(`${label} API URL 不能为空。`);
  if (typeof raw.model !== "string" || !raw.model.trim()) throw new Error(`${label}模型名称不能为空。`);
  if (typeof raw.apiKey !== "string" || !raw.apiKey.trim()) throw new Error(`${label} API Key 不能为空。`);
  return {
    protocol: raw.protocol,
    baseUrl: raw.baseUrl.slice(0, 2000),
    model: raw.model.slice(0, 200),
    apiKey: raw.apiKey,
  };
}

function validateTestSetup(value: unknown): TestSetup {
  if (!value || typeof value !== "object") throw new Error("测试集配置缺失。");
  const raw = value as Record<string, unknown>;
  if (raw.mode === "custom") {
    if (!Array.isArray(raw.tests)) throw new Error("自定义测试集格式不正确。");
    const tests = raw.tests.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const test = item as Record<string, unknown>;
      const input = typeof test.input === "string" ? test.input.trim() : "";
      const goal = typeof test.goal === "string" ? test.goal.trim() : "";
      if (!input) return [];
      if (input.length > 2000) throw new Error("单条测试输入不能超过 2,000 个字符。");
      if (goal.length > 1000) throw new Error("单条测试目标不能超过 1,000 个字符。");
      return [{ input, goal }];
    });
    if (tests.length < 1 || tests.length > 10) throw new Error("请提供 1 到 10 条有效的自定义测试输入。");
    return { mode: "custom", tests };
  }
  if (raw.mode === "ai") {
    const count = Number(raw.count);
    if (!Number.isInteger(count) || count < 2 || count > 8) throw new Error("AI 测试集数量必须在 2 到 8 之间。");
    const guidance = typeof raw.guidance === "string" ? raw.guidance.trim() : "";
    if (guidance.length > 2000) throw new Error("测试集生成说明不能超过 2,000 个字符。");
    return { mode: "ai", count, guidance };
  }
  throw new Error("不支持的测试集模式。");
}

function validate(value: RequestPayload) {
  const optimizer = providerConfig(value.optimizer, "优化模型");
  const evaluator = providerConfig(value.evaluator, "评估模型");
  if (typeof value.requirement !== "string" || !value.requirement.trim()) throw new Error("System Prompt 需求不能为空。");
  if (value.requirement.length > 8000) throw new Error("System Prompt 需求不能超过 8,000 个字符。");
  if (typeof value.criteria !== "string") throw new Error("质量目标格式不正确。");
  if (value.criteria.length > 3000) throw new Error("质量目标不能超过 3,000 个字符。");
  const rounds = Number(value.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 8) throw new Error("优化轮次必须在 1 到 8 之间。");
  return {
    optimizer,
    evaluator,
    requirement: value.requirement,
    criteria: value.criteria,
    rounds,
    testSetup: validateTestSetup(value.testSetup),
  };
}

export async function POST(request: Request) {
  let input: ReturnType<typeof validate>;
  try {
    const payload = await request.json() as RequestPayload;
    input = validate(payload);
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "请求内容不正确。" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const event of optimizePrompt(
          input.optimizer,
          input.evaluator,
          input.requirement,
          input.criteria,
          input.rounds,
          input.testSetup,
          request.signal,
        )) send(event);
      } catch (error) {
        if (!request.signal.aborted) send({ type: "error", message: error instanceof Error ? error.message : "优化过程意外中断。" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
