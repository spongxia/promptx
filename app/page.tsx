"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Protocol = "openai-chat" | "openai-responses" | "anthropic";
type ModelRole = "optimizer" | "evaluator";
type ConnectionState = "idle" | "success" | "error";
type TestMode = "custom" | "ai";

type ProviderForm = {
  protocol: Protocol;
  baseUrl: string;
  model: string;
  apiKey: string;
};

type TestDraft = { id: string; input: string; goal: string };
type TestCase = { id: string; name: string; input: string; goal: string };
type TestResult = TestCase & { output: string };
type CaseEvaluation = { test_id: string; score: number; passed: boolean; reason: string };

type Evaluation = {
  score: number;
  verdict: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  next_actions: string[];
  case_results: CaseEvaluation[];
};

type Round = {
  index: number;
  results?: TestResult[];
  evaluation?: Evaluation;
  revisedPrompt?: string;
  status: "waiting" | "testing" | "evaluating" | "revising" | "done";
};

type Usage = { inputTokens: number; outputTokens: number; calls: number };
type UsageBreakdown = { total: Usage; optimizer: Usage; evaluator: Usage };

type RunEvent =
  | { type: "phase"; phase: string; round?: number; message: string }
  | { type: "tests"; tests: TestCase[]; source: TestMode }
  | { type: "expanded"; prompt: string }
  | { type: "tested"; round: number; results: TestResult[] }
  | { type: "evaluated"; round: number; evaluation: Evaluation }
  | { type: "revised"; round: number; prompt: string }
  | { type: "complete"; finalPrompt: string; usage: UsageBreakdown }
  | { type: "error"; message: string };

const protocolMeta: Record<Protocol, { short: string; defaultUrl: string; defaultModel: string; hint: string }> = {
  "openai-responses": {
    short: "Responses",
    defaultUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.5",
    hint: "OpenAI 原生 /responses",
  },
  "openai-chat": {
    short: "Chat",
    defaultUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.5",
    hint: "OpenAI、DeepSeek 与兼容网关",
  },
  anthropic: {
    short: "Anthropic",
    defaultUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-opus-4-8",
    hint: "Anthropic 原生 /messages",
  },
};

const defaultProvider = (): ProviderForm => ({
  protocol: "openai-responses",
  baseUrl: protocolMeta["openai-responses"].defaultUrl,
  model: protocolMeta["openai-responses"].defaultModel,
  apiKey: "",
});

const sampleRequirement =
  "写一个英语单词学习助手的 System Prompt。运行时用户会输入一个英文单词，助手需要用中文帮助学习者准确、系统地掌握这个词。System Prompt 本身不能绑定任何具体单词。";

const sampleCriteria =
  "释义准确；包含 IPA、词性、常见含义、自然例句和常见搭配；区分多义词；不确定时明确说明，不能编造。";

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

function Icon({ name }: { name: "target" | "loop" | "arrow" | "copy" | "download" | "check" | "test" | "plus" }) {
  const symbols = { target: "◎", loop: "↻", arrow: "→", copy: "□", download: "↓", check: "✓", test: "◌", plus: "+" };
  return <span className={`icon icon-${name}`} aria-hidden="true">{symbols[name]}</span>;
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${Math.max(0, Math.min(100, score)) * 3.6}deg` } as React.CSSProperties} aria-label={`评分 ${score} 分`}>
      <span>{score}</span>
    </div>
  );
}

function TextPreview({ text, lines = 6 }: { text: string; lines?: number }) {
  return <pre className="text-preview" style={{ WebkitLineClamp: lines }}>{text}</pre>;
}

type ModelConfigProps = {
  idPrefix: string;
  title: string;
  badge: string;
  description: string;
  config: ProviderForm;
  connection: ConnectionState;
  isTesting: boolean;
  showKey: boolean;
  disabled: boolean;
  onConfig: (patch: Partial<ProviderForm>) => void;
  onProtocol: (protocol: Protocol) => void;
  onShowKey: () => void;
  onTest: () => void;
};

function ModelConfigCard({
  idPrefix, title, badge, description, config, connection, isTesting, showKey, disabled,
  onConfig, onProtocol, onShowKey, onTest,
}: ModelConfigProps) {
  return (
    <div className="model-config-card">
      <div className="model-role-heading">
        <div><span>{badge}</span><h3>{title}</h3></div>
        <p>{description}</p>
      </div>
      <div className="protocol-tabs" role="radiogroup" aria-label={`${title} API 协议`}>
        {(Object.keys(protocolMeta) as Protocol[]).map((item) => (
          <button key={item} type="button" role="radio" aria-checked={config.protocol === item} className={config.protocol === item ? "active" : ""} onClick={() => onProtocol(item)}>
            {protocolMeta[item].short}
          </button>
        ))}
      </div>
      <p className="protocol-hint">{protocolMeta[config.protocol].hint}</p>

      <label className="field-label" htmlFor={`${idPrefix}-url`}>API URL</label>
      <input id={`${idPrefix}-url`} value={config.baseUrl} onChange={(event) => onConfig({ baseUrl: event.target.value })} placeholder={protocolMeta[config.protocol].defaultUrl} />

      <label className="field-label" htmlFor={`${idPrefix}-key`}>API Key</label>
      <div className="input-action-wrap">
        <input id={`${idPrefix}-key`} type={showKey ? "text" : "password"} value={config.apiKey} onChange={(event) => onConfig({ apiKey: event.target.value })} placeholder="sk-••••••••••••••••" autoComplete="off" spellCheck={false} />
        <button type="button" onClick={onShowKey} aria-label={showKey ? `隐藏${title} API Key` : `显示${title} API Key`}>{showKey ? "隐藏" : "显示"}</button>
      </div>

      <label className="field-label" htmlFor={`${idPrefix}-model`}>模型名称</label>
      <div className="model-row">
        <input id={`${idPrefix}-model`} value={config.model} onChange={(event) => onConfig({ model: event.target.value })} placeholder={protocolMeta[config.protocol].defaultModel} />
        <button type="button" className={`test-button ${connection}`} onClick={onTest} disabled={disabled || isTesting}>
          <Icon name={connection === "success" ? "check" : "test"} />
          {isTesting ? "测试中" : connection === "success" ? "已连接" : "测试"}
        </button>
      </div>
    </div>
  );
}

function EmptyWorkspace({ totalCalls, testCount }: { totalCalls: number; testCount: number }) {
  return (
    <section className="empty-workspace">
      <div className="empty-orbit" aria-hidden="true">
        <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><BrandMark /></div>
      </div>
      <p className="eyebrow">SYSTEM PROMPT EVALUATION LAB</p>
      <h2>优化 System Prompt，<br />不把测试题写进答案。</h2>
      <p className="empty-copy">System Prompt 与 user message 始终分离。便宜模型负责生成和改写，强模型负责跨测试集评估，也可以让两者使用同一配置。</p>
      <div className="prompt-architecture" aria-label="System Prompt 测试架构">
        <span><small>SYSTEM</small>通用提示词</span><b>＋</b><span><small>USER</small>{testCount} 条测试输入</span><b>→</b><span className="accent"><small>EVAL</small>综合评估</span>
      </div>
      <div className="empty-note"><span className="status-dot" />当前配置预计调用 {totalCalls} 次模型</div>
    </section>
  );
}

export default function Home() {
  const [optimizer, setOptimizer] = useState<ProviderForm>(defaultProvider);
  const [evaluator, setEvaluator] = useState<ProviderForm>(defaultProvider);
  const [sameEvaluator, setSameEvaluator] = useState(true);
  const [showOptimizerKey, setShowOptimizerKey] = useState(false);
  const [showEvaluatorKey, setShowEvaluatorKey] = useState(false);
  const [connection, setConnection] = useState<Record<ModelRole, ConnectionState>>({ optimizer: "idle", evaluator: "idle" });
  const [testingRole, setTestingRole] = useState<ModelRole | null>(null);

  const [requirement, setRequirement] = useState("");
  const [criteria, setCriteria] = useState("");
  const [testMode, setTestMode] = useState<TestMode>("custom");
  const [customTests, setCustomTests] = useState<TestDraft[]>([
    { id: "custom-1", input: "", goal: "" },
    { id: "custom-2", input: "", goal: "" },
    { id: "custom-3", input: "", goal: "" },
  ]);
  const [autoTestCount, setAutoTestCount] = useState(4);
  const [autoGuidance, setAutoGuidance] = useState("");
  const [roundCount, setRoundCount] = useState(3);

  const [resolvedTests, setResolvedTests] = useState<TestCase[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [expandedPrompt, setExpandedPrompt] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [usage, setUsage] = useState<UsageBreakdown | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("等待开始");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const effectiveEvaluator = sameEvaluator ? optimizer : evaluator;
  const activeTestCount = testMode === "ai" ? autoTestCount : Math.max(1, customTests.filter((item) => item.input.trim()).length);
  const callEstimate = useMemo(() => {
    const optimizerCalls = 1 + roundCount * (activeTestCount + 1);
    const evaluatorCalls = (testMode === "ai" ? 1 : 0) + roundCount;
    return { optimizer: optimizerCalls, evaluator: evaluatorCalls, total: optimizerCalls + evaluatorCalls };
  }, [activeTestCount, roundCount, testMode]);
  const averageScore = useMemo(() => {
    const scores = rounds.flatMap((round) => round.evaluation ? [round.evaluation.score] : []);
    return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  }, [rounds]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("promptlab-config-v2");
      if (!saved) return;
      const value = JSON.parse(saved) as Partial<{
        optimizer: Omit<ProviderForm, "apiKey">;
        evaluator: Omit<ProviderForm, "apiKey">;
        sameEvaluator: boolean;
        testMode: TestMode;
        autoTestCount: number;
        autoGuidance: string;
        roundCount: number;
      }>;
      const timer = window.setTimeout(() => {
        if (value.optimizer) setOptimizer((current) => ({ ...current, ...value.optimizer, apiKey: "" }));
        if (value.evaluator) setEvaluator((current) => ({ ...current, ...value.evaluator, apiKey: "" }));
        if (typeof value.sameEvaluator === "boolean") setSameEvaluator(value.sameEvaluator);
        if (value.testMode === "custom" || value.testMode === "ai") setTestMode(value.testMode);
        if (value.autoTestCount) setAutoTestCount(Math.min(8, Math.max(2, value.autoTestCount)));
        if (typeof value.autoGuidance === "string") setAutoGuidance(value.autoGuidance);
        if (value.roundCount) setRoundCount(Math.min(8, Math.max(1, value.roundCount)));
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      // Ignore malformed local preferences. API keys and custom test content are never persisted.
    }
  }, []);

  useEffect(() => {
    const { apiKey: optimizerKey, ...optimizerPublic } = optimizer;
    const { apiKey: evaluatorKey, ...evaluatorPublic } = evaluator;
    void optimizerKey;
    void evaluatorKey;
    window.localStorage.setItem("promptlab-config-v2", JSON.stringify({ optimizer: optimizerPublic, evaluator: evaluatorPublic, sameEvaluator, testMode, autoTestCount, autoGuidance, roundCount }));
  }, [optimizer, evaluator, sameEvaluator, testMode, autoTestCount, autoGuidance, roundCount]);

  function updateProvider(role: ModelRole, patch: Partial<ProviderForm>) {
    const setter = role === "optimizer" ? setOptimizer : setEvaluator;
    setter((current) => ({ ...current, ...patch }));
    setConnection((current) => ({ ...current, [role]: "idle" }));
  }

  function changeProtocol(role: ModelRole, next: Protocol) {
    const current = role === "optimizer" ? optimizer : evaluator;
    const currentDefaultUrl = Object.values(protocolMeta).some((item) => item.defaultUrl === current.baseUrl);
    const currentDefaultModel = Object.values(protocolMeta).some((item) => item.defaultModel === current.model);
    updateProvider(role, {
      protocol: next,
      baseUrl: currentDefaultUrl || !current.baseUrl.trim() ? protocolMeta[next].defaultUrl : current.baseUrl,
      model: currentDefaultModel || !current.model.trim() ? protocolMeta[next].defaultModel : current.model,
    });
  }

  function toggleEvaluator() {
    if (sameEvaluator) setEvaluator({ ...optimizer });
    setSameEvaluator((value) => !value);
    setConnection((current) => ({ ...current, evaluator: "idle" }));
  }

  function useExample() {
    setRequirement(sampleRequirement);
    setCriteria(sampleCriteria);
    setTestMode("custom");
    setCustomTests([
      { id: "example-1", input: "serendipity", goal: "解释较抽象名词，并给出自然语境" },
      { id: "example-2", input: "run", goal: "正确处理高频多义词，避免堆砌" },
      { id: "example-3", input: "ubiquitous", goal: "解释正式词汇并给出常见搭配" },
    ]);
  }

  function updateCustomTest(id: string, patch: Partial<TestDraft>) {
    setCustomTests((tests) => tests.map((test) => test.id === id ? { ...test, ...patch } : test));
  }

  function addCustomTest() {
    if (customTests.length >= 10) return;
    setCustomTests((tests) => [...tests, { id: `custom-${Date.now()}`, input: "", goal: "" }]);
  }

  function removeCustomTest(id: string) {
    setCustomTests((tests) => tests.length > 1 ? tests.filter((test) => test.id !== id) : tests);
  }

  function updateRound(index: number, update: Partial<Round>) {
    setRounds((current) => current.map((round) => round.index === index ? { ...round, ...update } : round));
  }

  async function testConnection(role: ModelRole) {
    const config = role === "optimizer" ? optimizer : effectiveEvaluator;
    if (!config.apiKey.trim() || !config.baseUrl.trim() || !config.model.trim()) {
      setError(`请先填写${role === "optimizer" ? "优化" : "评估"}模型的 API URL、API Key 和模型名称。`);
      return;
    }
    setError("");
    setTestingRole(role);
    setConnection((current) => ({ ...current, [role]: "idle" }));
    try {
      const response = await fetch("/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.message || "连接失败");
      setConnection((current) => ({ ...current, [role]: "success" }));
    } catch (cause) {
      setConnection((current) => ({ ...current, [role]: "error" }));
      setError(cause instanceof Error ? cause.message : "连接失败，请检查配置。");
    } finally {
      setTestingRole(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!requirement.trim()) {
      setError("先描述你要创建的 System Prompt 及其运行目标。");
      return;
    }
    if (!optimizer.apiKey.trim() || !optimizer.baseUrl.trim() || !optimizer.model.trim()) {
      setError("优化模型的 API URL、API Key 和模型名称都需要填写。");
      return;
    }
    if (!effectiveEvaluator.apiKey.trim() || !effectiveEvaluator.baseUrl.trim() || !effectiveEvaluator.model.trim()) {
      setError("评估模型的 API URL、API Key 和模型名称都需要填写。");
      return;
    }
    const validCustomTests = customTests.filter((item) => item.input.trim());
    if (testMode === "custom" && validCustomTests.length < 1) {
      setError("请至少填写一条自定义 user message，或切换为 AI 自动生成测试集。");
      return;
    }

    const testSetup = testMode === "custom"
      ? { mode: "custom" as const, tests: validCustomTests.map(({ input, goal }) => ({ input, goal })) }
      : { mode: "ai" as const, count: autoTestCount, guidance: autoGuidance };

    setError("");
    setFinalPrompt("");
    setExpandedPrompt("");
    setResolvedTests([]);
    setUsage(null);
    setCopied(false);
    setRounds(Array.from({ length: roundCount }, (_, index) => ({ index: index + 1, status: "waiting" })));
    setActiveRound(null);
    setIsRunning(true);
    setStatus(testMode === "ai" ? "评估模型正在生成测试集…" : "正在准备自定义测试集…");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optimizer, evaluator: effectiveEvaluator, requirement, criteria, rounds: roundCount, testSetup }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(payload.message || `请求失败（${response.status}）`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const data = block.split("\n").find((line) => line.startsWith("data: "));
          if (!data) continue;
          const message = JSON.parse(data.slice(6)) as RunEvent;
          if (message.type === "phase") {
            setStatus(message.message);
            if (message.round) {
              setActiveRound(message.round);
              const phaseStatus = message.phase === "test" ? "testing" : message.phase === "evaluate" ? "evaluating" : "revising";
              updateRound(message.round, { status: phaseStatus });
            }
          } else if (message.type === "tests") {
            setResolvedTests(message.tests);
          } else if (message.type === "expanded") {
            setExpandedPrompt(message.prompt);
          } else if (message.type === "tested") {
            updateRound(message.round, { results: message.results, status: "evaluating" });
          } else if (message.type === "evaluated") {
            updateRound(message.round, { evaluation: message.evaluation, status: "revising" });
          } else if (message.type === "revised") {
            updateRound(message.round, { revisedPrompt: message.prompt, status: "done" });
          } else if (message.type === "complete") {
            setFinalPrompt(message.finalPrompt);
            setUsage(message.usage);
            setStatus("System Prompt 优化完成");
          } else if (message.type === "error") {
            throw new Error(message.message);
          }
        }
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setStatus("已停止");
      else {
        setError(cause instanceof Error ? cause.message : "优化中断，请稍后重试。");
        setStatus("运行中断");
      }
    } finally {
      setIsRunning(false);
      setActiveRound(null);
      abortRef.current = null;
    }
  }

  async function copyFinalPrompt() {
    await navigator.clipboard.writeText(finalPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadFinalPrompt() {
    const content = `# 优化后的 System Prompt\n\n${finalPrompt}\n\n---\n由 PromptLab 经过 ${roundCount} 轮、${resolvedTests.length} 条测试输入迭代生成。`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "optimized-system-prompt.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><BrandMark /><span>PROMPT</span><b>LAB</b></div>
        <div className="topbar-center">System Prompt 迭代评估工作台 <span>Beta</span></div>
        <div className="privacy-pill"><span className="status-dot" />API Key 不落盘</div>
      </header>

      <div className="workspace-shell">
        <aside className="control-panel">
          <form onSubmit={handleSubmit}>
            <section className="control-section">
              <div className="section-heading">
                <span className="step-number">01</span>
                <div><h2>定义 System Prompt</h2><p>只描述通用行为，不写具体测试输入</p></div>
                <button type="button" className="text-button" onClick={useExample}>单词学习示例</button>
              </div>
              <label className="field-label" htmlFor="requirement">要求与运行目标 <span>必填</span></label>
              <textarea id="requirement" className="large-textarea" value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="例如：写一个英语单词学习助手的 System Prompt。用户稍后会输入具体单词……" maxLength={8000} />
              <div className="char-count">{requirement.length.toLocaleString()} / 8,000</div>
              <label className="field-label" htmlFor="criteria">质量目标 <em>可选</em></label>
              <textarea id="criteria" className="small-textarea" value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="例如：准确、结构稳定、对多义词处理合理、不编造……" maxLength={3000} />
              <div className="separation-note"><span>SYSTEM</span>这里的内容只用于写通用提示词，测试集不会进入初始编写上下文。</div>
            </section>

            <section className="control-section">
              <div className="section-heading">
                <span className="step-number">02</span>
                <div><h2>分配模型角色</h2><p>生成改写与质量评估可以使用不同模型</p></div>
              </div>
              <ModelConfigCard
                idPrefix="optimizer" title="优化模型" badge="BUILD" description="编写 System Prompt、运行测试并根据结论改写"
                config={optimizer} connection={connection.optimizer} isTesting={testingRole === "optimizer"} showKey={showOptimizerKey} disabled={isRunning}
                onConfig={(patch) => updateProvider("optimizer", patch)} onProtocol={(value) => changeProtocol("optimizer", value)} onShowKey={() => setShowOptimizerKey((value) => !value)} onTest={() => testConnection("optimizer")}
              />

              <button type="button" role="switch" aria-checked={sameEvaluator} className={`same-model-toggle ${sameEvaluator ? "active" : ""}`} onClick={toggleEvaluator}>
                <span><i /></span><b>评估模型沿用优化模型</b><em>{sameEvaluator ? "当前为同一个模型" : "已启用独立配置"}</em>
              </button>

              {!sameEvaluator && (
                <div className="evaluator-config-wrap">
                  <div className="copy-config-row"><span>独立评估配置</span><button type="button" onClick={() => {
                    setEvaluator({ ...optimizer });
                    setConnection((value) => ({ ...value, evaluator: "idle" }));
                  }}>复制优化模型配置</button></div>
                  <ModelConfigCard
                    idPrefix="evaluator" title="评估模型" badge="JUDGE" description="自动出题并跨测试结果进行高质量判断"
                    config={evaluator} connection={connection.evaluator} isTesting={testingRole === "evaluator"} showKey={showEvaluatorKey} disabled={isRunning}
                    onConfig={(patch) => updateProvider("evaluator", patch)} onProtocol={(value) => changeProtocol("evaluator", value)} onShowKey={() => setShowEvaluatorKey((value) => !value)} onTest={() => testConnection("evaluator")}
                  />
                </div>
              )}
              <p className="field-help model-role-help">运行测试也使用优化模型；评估模型只负责出题与判断，避免把高成本模型消耗在每条生成上。</p>
            </section>

            <section className="control-section">
              <div className="section-heading">
                <span className="step-number">03</span>
                <div><h2>准备测试集</h2><p>测试输入会作为独立 user message 发送</p></div>
              </div>
              <div className="test-mode-tabs" role="radiogroup" aria-label="测试集来源">
                <button type="button" role="radio" aria-checked={testMode === "custom"} className={testMode === "custom" ? "active" : ""} onClick={() => setTestMode("custom")}><span>手动</span>自定义测试集</button>
                <button type="button" role="radio" aria-checked={testMode === "ai"} className={testMode === "ai" ? "active" : ""} onClick={() => setTestMode("ai")}><span>AI</span>自动生成测试集</button>
              </div>

              {testMode === "custom" ? (
                <div className="custom-tests">
                  {customTests.map((test, index) => (
                    <div className="custom-test-card" key={test.id}>
                      <div className="custom-test-head"><span>USER {String(index + 1).padStart(2, "0")}</span><button type="button" aria-label={`删除测试 ${index + 1}`} onClick={() => removeCustomTest(test.id)} disabled={customTests.length === 1}>×</button></div>
                      <textarea value={test.input} onChange={(event) => updateCustomTest(test.id, { input: event.target.value })} placeholder="具体 user message，例如：serendipity" maxLength={2000} />
                      <input value={test.goal} onChange={(event) => updateCustomTest(test.id, { goal: event.target.value })} placeholder="本条期望（可选）" maxLength={1000} />
                    </div>
                  ))}
                  <button type="button" className="add-test-button" onClick={addCustomTest} disabled={customTests.length >= 10}><Icon name="plus" />添加测试输入 <span>{customTests.length}/10</span></button>
                </div>
              ) : (
                <div className="auto-test-config">
                  <div className="round-label-row"><label htmlFor="auto-test-count">生成数量</label><output>{autoTestCount} 条</output></div>
                  <input id="auto-test-count" className="range" type="range" min="2" max="8" step="1" value={autoTestCount} onChange={(event) => setAutoTestCount(Number(event.target.value))} />
                  <label className="field-label" htmlFor="auto-guidance">覆盖重点 <em>可选</em></label>
                  <textarea id="auto-guidance" className="small-textarea" value={autoGuidance} onChange={(event) => setAutoGuidance(event.target.value)} placeholder="例如：覆盖多义词、罕见词、拼写错误和非英文输入……" maxLength={2000} />
                  <p className="field-help">评估模型只根据要求与质量目标出题，不会看到初始 System Prompt。</p>
                </div>
              )}
            </section>

            <section className="control-section round-section">
              <div className="section-heading"><span className="step-number">04</span><div><h2>设置迭代</h2><p>每轮都会执行全部测试后再综合评估</p></div></div>
              <div className="round-label-row"><label htmlFor="rounds">优化轮次</label><output>{roundCount} 轮</output></div>
              <input id="rounds" className="range" type="range" min="1" max="8" step="1" value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))} />
              <div className="range-scale"><span>1</span><span>快速</span><span>平衡</span><span>深度</span><span>8</span></div>
              <div className="call-estimate role-estimate">
                <Icon name="loop" />
                <div><span>优化模型 <b>{callEstimate.optimizer}</b> 次</span><span>评估模型 <b>{callEstimate.evaluator}</b> 次</span></div>
                <strong>{callEstimate.total}</strong>
              </div>
            </section>

            {error && <div className="error-banner" role="alert"><b>!</b><span>{error}</span></div>}
            <button className="run-button" type="submit" disabled={isRunning}>
              {isRunning ? <><span className="spinner" />优化进行中</> : <><BrandMark />开始优化 System Prompt<Icon name="arrow" /></>}
            </button>
            {isRunning && <button type="button" className="stop-button" onClick={() => abortRef.current?.abort()}>停止本次运行</button>}
          </form>
        </aside>

        <section className="main-workspace">
          {!expandedPrompt && rounds.length === 0 && !finalPrompt && resolvedTests.length === 0 ? <EmptyWorkspace totalCalls={callEstimate.total} testCount={activeTestCount} /> : (
            <div className="run-view">
              <div className="run-header">
                <div><p className="eyebrow">SYSTEM PROMPT RUN</p><h1>System Prompt 进化轨迹</h1><p>测试输入始终作为 user message 独立执行。</p></div>
                <div className={`run-status ${isRunning ? "running" : finalPrompt ? "complete" : "paused"}`}><span />{status}</div>
              </div>

              {resolvedTests.length > 0 && (
                <article className="test-set-card">
                  <div className="test-set-heading"><div><p className="eyebrow">TEST SET</p><h3>{testMode === "ai" ? "AI 生成测试集" : "自定义测试集"}</h3></div><span>{resolvedTests.length} 条 USER 输入</span></div>
                  <div className="test-case-grid">{resolvedTests.map((test) => <div key={test.id}><small>{test.name}</small><b>{test.input}</b>{test.goal && <p>{test.goal}</p>}</div>)}</div>
                </article>
              )}

              {expandedPrompt && (
                <article className="initial-card">
                  <div className="initial-card-top"><div><div className="card-kicker"><Icon name="target" />SYSTEM PROMPT v1</div><h3>优化模型写出的第一版通用系统指令</h3></div><span className="clean-badge"><Icon name="check" />不含测试输入</span></div>
                  <TextPreview text={expandedPrompt} lines={7} />
                </article>
              )}

              <div className="timeline">
                {rounds.map((round) => {
                  const isActive = activeRound === round.index;
                  return (
                    <article key={round.index} className={`round-card ${round.status} ${isActive ? "active" : ""}`}>
                      <div className="timeline-node"><span>{round.index}</span></div>
                      <div className="round-card-inner">
                        <div className="round-card-header">
                          <div><p>ROUND {String(round.index).padStart(2, "0")}</p><h3>{round.status === "waiting" ? "等待运行" : round.status === "testing" ? `正在执行 ${resolvedTests.length} 条测试` : round.status === "evaluating" ? "强模型正在综合评估" : round.status === "revising" ? "正在泛化评估结论" : "本轮完成"}</h3></div>
                          {round.evaluation ? <ScoreRing score={round.evaluation.score} /> : round.status !== "waiting" && <span className="mini-loader" />}
                        </div>

                        {round.results && (
                          <details>
                            <summary><span>测试运行结果</span><small>{round.results.length} 组 System + User 输出</small><b>＋</b></summary>
                            <div className="test-results-list">
                              {round.results.map((result) => {
                                const caseEval = round.evaluation?.case_results.find((item) => item.test_id === result.id);
                                return (
                                  <article className="test-result-item" key={result.id}>
                                    <div className="test-result-head"><div><small>USER · {result.name}</small><b>{result.input}</b></div>{caseEval && <span className={caseEval.passed ? "passed" : "failed"}>{caseEval.score}</span>}</div>
                                    <TextPreview text={result.output} lines={9} />
                                    {caseEval?.reason && <p className="case-reason">{caseEval.reason}</p>}
                                  </article>
                                );
                              })}
                            </div>
                          </details>
                        )}

                        {round.evaluation && (
                          <div className="evaluation-block">
                            <div className="verdict-row"><span>{round.evaluation.verdict}</span><p>{round.evaluation.summary}</p></div>
                            <div className="evaluation-columns">
                              <div><h4>跨测试保留</h4><ul>{round.evaluation.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
                              <div><h4>Prompt 级改进</h4><ul>{round.evaluation.weaknesses.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
                            </div>
                          </div>
                        )}

                        {round.revisedPrompt && (
                          <details className="revised-details">
                            <summary><span>System Prompt v{round.index + 1}</span><small>已泛化评估结论，不复制测试题</small><b>＋</b></summary>
                            <TextPreview text={round.revisedPrompt} lines={12} />
                          </details>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {finalPrompt && (
                <article className="final-card">
                  <div className="final-topline">
                    <div><p className="eyebrow">FINAL SYSTEM PROMPT</p><h2>通用系统指令已经就绪。</h2><small>部署时放入 System；具体内容在运行时作为 User 输入追加。</small></div>
                    <div className="final-metric"><span>平均评分</span><b>{averageScore}</b><em>/ 100</em></div>
                  </div>
                  <pre className="final-prompt">{finalPrompt}</pre>
                  <div className="final-actions">
                    <button type="button" className="primary-action" onClick={copyFinalPrompt}><Icon name={copied ? "check" : "copy"} />{copied ? "已复制" : "复制 System Prompt"}</button>
                    <button type="button" onClick={downloadFinalPrompt}><Icon name="download" />下载 Markdown</button>
                    {usage && <div className="usage">优化 {usage.optimizer.calls} 次 · 评估 {usage.evaluator.calls} 次 · {usage.total.inputTokens + usage.total.outputTokens} tokens</div>}
                  </div>
                </article>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
