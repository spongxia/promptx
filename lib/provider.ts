export type Protocol = "openai-chat" | "openai-responses" | "anthropic";

export type ProviderConfig = {
  protocol: Protocol;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

export type ModelResult = {
  text: string;
  usage: TokenUsage;
};

const ENDPOINTS: Record<Protocol, string> = {
  "openai-chat": "chat/completions",
  "openai-responses": "responses",
  anthropic: "messages",
};

function endpointFor(rawBaseUrl: string, protocol: Protocol): string {
  const base = rawBaseUrl.trim();
  if (!base) throw new Error("API URL 不能为空。");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error("API URL 格式不正确。");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("API URL 只支持 HTTP 或 HTTPS。");
  if (url.username || url.password) throw new Error("请不要把凭据写进 API URL。");

  const expected = ENDPOINTS[protocol];
  const cleanPath = url.pathname.replace(/\/+$/, "");
  const knownEndpoint = /\/(chat\/completions|responses|messages)$/;
  const match = cleanPath.match(knownEndpoint);
  if (match) {
    url.pathname = match[1] === expected ? cleanPath : cleanPath.replace(knownEndpoint, `/${expected}`);
    return url.toString();
  }

  if (!cleanPath || cleanPath === "/") {
    url.pathname = `/v1/${expected}`;
  } else if (cleanPath.endsWith("/v1")) {
    url.pathname = `${cleanPath}/${expected}`;
  } else {
    url.pathname = `${cleanPath}/${expected}`;
  }
  return url.toString();
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const value = part as Record<string, unknown>;
      if (typeof value.text === "string") return value.text;
      if (value.text && typeof value.text === "object" && typeof (value.text as Record<string, unknown>).value === "string") {
        return (value.text as Record<string, unknown>).value as string;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseResponseText(payload: Record<string, unknown>, protocol: Protocol): string {
  if (protocol === "openai-chat") {
    const choices = payload.choices;
    if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
      const message = (choices[0] as Record<string, unknown>).message;
      if (message && typeof message === "object") return textFromContent((message as Record<string, unknown>).content);
      return textFromContent((choices[0] as Record<string, unknown>).text);
    }
  }

  if (protocol === "anthropic") return textFromContent(payload.content);

  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output
      .map((item) => item && typeof item === "object" ? textFromContent((item as Record<string, unknown>).content) : "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseUsage(payload: Record<string, unknown>): TokenUsage {
  const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {};
  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  return {
    inputTokens: typeof input === "number" ? input : 0,
    outputTokens: typeof output === "number" ? output : 0,
    calls: 1,
  };
}

function safeErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>;
    const error = value.error;
    if (typeof error === "string") return error.slice(0, 500);
    if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
      return ((error as Record<string, unknown>).message as string).slice(0, 500);
    }
    if (typeof value.message === "string") return value.message.slice(0, 500);
  }
  return `模型服务返回了 HTTP ${status}。`;
}

export async function callModel(
  config: ProviderConfig,
  system: string,
  input: string,
  signal?: AbortSignal,
): Promise<ModelResult> {
  if (!config.apiKey.trim()) throw new Error("API Key 不能为空。");
  if (!config.model.trim()) throw new Error("模型名称不能为空。");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  let body: Record<string, unknown>;
  let headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.protocol === "openai-chat") {
    headers.Authorization = `Bearer ${config.apiKey}`;
    body = {
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
    };
  } else if (config.protocol === "openai-responses") {
    headers.Authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, instructions: system, input, store: false };
  } else {
    headers = {
      ...headers,
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: config.model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: input }],
    };
  }

  try {
    const response = await fetch(endpointFor(config.baseUrl, config.protocol), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) throw new Error(safeErrorMessage(payload, response.status));
    if (!payload) throw new Error("模型服务没有返回有效 JSON。");
    const text = parseResponseText(payload, config.protocol).trim();
    if (!text) throw new Error("模型服务返回成功，但没有可读取的文本内容。");
    return { text, usage: parseUsage(payload) };
  } catch (error) {
    if (controller.signal.aborted) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      throw new Error("模型响应超时，请稍后重试或更换服务地址。");
    }
    if (error instanceof TypeError) throw new Error("无法连接模型服务，请检查 API URL、网络或服务端 CORS/代理配置。");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function isProtocol(value: unknown): value is Protocol {
  return value === "openai-chat" || value === "openai-responses" || value === "anthropic";
}
