---
title: Models and providers
description: Select first-party capabilities and preserve provider messages.
---

# Models and providers

The current TypeScript source includes first-party chat adapters for OpenAI, Anthropic, Ollama, Google, and Mistral, plus mock and custom model interfaces. The [compatibility matrix](/docs/reference/compatibility) distinguishes completion, chat, streaming, tools, embeddings, and evaluation. Only OpenAI ships a first-party embeddings adapter in this release line. Ollama has streaming but no first-party tool mapping.

Provider `timeout` is a total response deadline, including streaming bodies, in milliseconds. Set `0` only when intentionally disabling it. Cancellation remains independent. For Google tool continuations, persist the returned assistant `message`, including `providerData`, before appending tool results; streamed chat emits a `message` event for the same purpose. `stream` is the prompt-only convenience method.

The Google TypeScript adoption includes native SSE and signed tool continuation, but live Gemini qualification is a separate release gate. Python has not been migrated into this `origin/dev` worktree. Use the [source model exports](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/models/index.ts) for concrete constructors and options.

## Construct a real provider

Install `langfn`, keep API keys on the server, and set `OPENAI_API_KEY` and `OPENAI_MODEL` to credentials/model access available to your application:

```ts
import { OpenAIChatModel } from "langfn/models";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const model = new OpenAIChatModel({
  apiKey: required("OPENAI_API_KEY"),
  model: required("OPENAI_MODEL"),
  timeout: 30_000,
});
const response = await model.chat({
  messages: [{ role: "user", content: "Explain optimistic concurrency in one sentence." }],
  signal: AbortSignal.timeout(30_000),
});
console.log(response.message.content);
console.log(response.usage?.total_tokens);
```

A successful response contains an assistant `message`; usage may be absent depending on the provider. Preserve that complete message when continuing a conversation. Calls throw on missing credentials, provider authentication failures, rate limits, and timeouts; handle these at your application boundary and avoid unconditional retries of tool side effects.

Other first-party constructors use the same model contract:

```ts
import { AnthropicChatModel, GoogleChatModel, MistralChatModel, OllamaChatModel } from "langfn/models";

const anthropic = new AnthropicChatModel({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });
const google = new GoogleChatModel({ apiKey: process.env.GOOGLE_API_KEY, model: process.env.GOOGLE_MODEL });
const mistral = new MistralChatModel({ apiKey: process.env.MISTRAL_API_KEY, model: process.env.MISTRAL_MODEL });
const ollama = new OllamaChatModel({ baseUrl: "http://localhost:11434", model: process.env.OLLAMA_MODEL });
```

Validate required environment variables before constructing the selected provider. Model identifiers and access are provider/account-specific. For Ollama, run the local service and provision the model before calling it. These examples do not claim capability parity: consult the compatibility matrix before enabling tools or streaming for a provider.

## Streaming and cancellation

Continuing with `model` from the first example:

```ts
for await (const event of model.stream({
  prompt: "Describe a safe retry policy.",
  signal: AbortSignal.timeout(30_000),
})) {
  if (event.type === "content") process.stdout.write(event.delta);
}
```

`stream` takes a prompt, not a conversation. Event types also carry usage, tool, and completion information; do not assume every event is a text delta. To get LangFn's tracing, policy, and orchestration layer, pass the provider to `new LangFn({ model })` from `langfn`.
