# PromptX

[简体中文](./README.md) | [English](./README_EN.md)

PromptX is a traceable System Prompt optimization workspace. Provide a requirement, quality goals, and an iteration count, and PromptX will create an initial System Prompt and improve it through testing, evaluation, and revision.

## Key features

- Configure separate optimizer and evaluator models, or use the same model for both roles
- Write a custom test set or let AI generate one automatically
- Keep every test input as a separate user message instead of embedding it in the System Prompt
- Review per-round outputs, scores, evaluation findings, and prompt versions
- Use OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages
- Connect to OpenAI-compatible services with custom API URLs and model names
- Run locally without persisting API keys

## How it works

1. Create a reusable System Prompt from the requirement and quality goals
2. Pair the current System Prompt with each test input as a separate user message
3. Ask the evaluator model to judge the complete test run
4. Generalize the findings into a revised System Prompt
5. Repeat for the requested number of rounds and return the final version

During revision, the optimizer receives only generalized findings and anonymous scores. It does not receive concrete test inputs, model outputs, or case-specific explanations, which reduces test leakage and overfitting.

## Supported API protocols

- OpenAI Chat Completions, including OpenAI-compatible services such as DeepSeek
- OpenAI Responses
- Anthropic Messages

The API URL may be a service root, a `/v1` base URL, or a complete endpoint. Model names are forwarded unchanged, so official model IDs and gateway aliases are both supported.

## Run locally

Node.js `22.13.0` or later is required.

```bash
git clone https://github.com/spongxia/promptx.git
cd promptx
npm install
npm run dev
```

Open `http://localhost:3000`, configure the optimizer and evaluator, choose a test-set source, and select the number of optimization rounds.

## Security

- API keys are not written to localStorage, a database, or server logs
- An API key stays in the current page state and is forwarded only to the model service configured by the user
- Non-secret settings such as API URLs, model names, rounds, and test mode are stored locally in the browser
- Custom test content is not persisted in browser storage
- Only use API URLs that you trust

## Development and verification

```bash
npm run lint
npm test
```

`npm test` runs a production build before executing the automated tests.

## Contributing

Issues, feature proposals, and pull requests are welcome.

## License

PromptX is available under the [MIT License](./LICENSE).
