# PromptX

PromptX 是一个可追踪的 System Prompt 自动优化工作台。它把一条需求扩写成可复用的 System Prompt，再按指定轮次执行：

1. 将每条测试输入作为独立 user message，与当前 System Prompt 配对运行
2. 用独立的评估模型对全部结果进行结构化评分
3. 用优化模型把评估结论泛化为新的 System Prompt

优化模型和评估模型可以使用不同的协议、URL、API Key 与模型名，也可以沿用同一配置。测试集支持用户逐条输入，也支持由评估模型自动生成。具体测试内容不会进入初始 System Prompt 的编写上下文，改写阶段也会明确禁止复制测试题。

## 支持的 API 协议

- OpenAI Chat Completions（也适用于 DeepSeek 等 OpenAI 兼容服务）
- OpenAI Responses
- Anthropic Messages

API URL 可以填写服务根地址、`/v1` 地址或完整 endpoint。模型名称会原样发送，因此可使用官方模型名或平台代理别名。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。配置优化模型与评估模型，选择测试集来源并设置优化轮次即可运行。

## 安全说明

- API Key 不写入 localStorage、数据库或服务端日志，只存在于当前页面状态，并随本次 API 请求转发给用户指定的模型服务。
- 非密钥配置（协议、URL、模型名、轮次、测试模式）会保存在浏览器本地，方便下次继续使用。
- API Key 与自定义测试内容不会写入浏览器持久化存储。
- 部署到公共环境时，建议增加访问控制，并只使用可信的 API URL。

## 验证

```bash
npm run build
npm test
npm run lint
```

## 开源许可

本项目采用 [MIT License](./LICENSE)。
