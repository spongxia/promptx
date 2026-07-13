import { callModel, isProtocol, ProviderConfig } from "../../../lib/provider";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Partial<ProviderConfig>;
    if (!isProtocol(payload.protocol)) throw new Error("不支持的 API 协议。");
    if (typeof payload.baseUrl !== "string" || !payload.baseUrl.trim()) throw new Error("API URL 不能为空。");
    if (typeof payload.model !== "string" || !payload.model.trim()) throw new Error("模型名称不能为空。");
    if (typeof payload.apiKey !== "string" || !payload.apiKey.trim()) throw new Error("API Key 不能为空。");
    await callModel(
      { protocol: payload.protocol, baseUrl: payload.baseUrl, model: payload.model, apiKey: payload.apiKey },
      "This is a connection health check. Follow the user request exactly.",
      "Reply with exactly: OK",
      request.signal,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "连接失败。" }, { status: 502 });
  }
}
