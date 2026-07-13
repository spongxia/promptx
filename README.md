# PromptX

[简体中文](./README.md) | [English](./README_EN.md)

PromptX 是一个可追踪的 System Prompt 自动优化工作台。你只需要提供需求、质量目标和迭代轮次，它就会生成初始 System Prompt，并通过测试、评估和改写持续优化。

## 核心功能

- 优化模型和评估模型可以分别配置，也可以使用同一个模型
- 支持用户自定义测试集，或由 AI 自动生成测试集
- 测试输入始终作为独立的 user message，不会写入 System Prompt
- 展示每轮测试输出、评分、评估结论和提示词版本
- 支持 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages
- 支持 OpenAI 兼容服务、自定义 API URL 和模型名称
- 本地运行，API Key 不会持久化保存

## 工作流程

1. 根据需求和质量目标生成可复用的 System Prompt
2. 将每条测试输入作为独立 user message，与当前 System Prompt 配对运行
3. 使用评估模型综合判断全部测试结果
4. 将评估结论泛化为新的 System Prompt
5. 按用户指定的轮次重复执行，输出最终版本

改写阶段只接收泛化后的评估结论和匿名分数，不会接收具体测试输入、模型输出或测试解释，从而降低测试内容泄漏和过拟合风险。

## 支持的 API 协议

- OpenAI Chat Completions（也适用于 DeepSeek 等 OpenAI 兼容服务）
- OpenAI Responses
- Anthropic Messages

API URL 可以填写服务根地址、`/v1` 地址或完整 endpoint。模型名称会原样发送，因此可以使用官方模型名或平台代理别名。

## 本地运行

需要 Node.js `22.13.0` 或更高版本。

```bash
git clone https://github.com/spongxia/promptx.git
cd promptx
npm install
npm run dev
```

打开 `http://localhost:3000`，配置优化模型与评估模型，选择测试集来源并设置优化轮次即可运行。

## 安全说明

- API Key 不写入 localStorage、数据库或服务端日志，只保存在当前页面状态中
- API Key 仅随当前请求转发给用户填写的模型服务
- API URL、模型名、轮次等非密钥配置会保存在浏览器本地
- 自定义测试内容不会写入浏览器持久化存储
- 请只使用可信的 API URL

## 开发与验证

```bash
npm run lint
npm test
```

`npm test` 会先执行生产构建，再运行自动测试。

## 参与贡献

欢迎提交 Issue、功能建议和 Pull Request。

## 开源许可

本项目采用 [MIT License](./LICENSE)。
