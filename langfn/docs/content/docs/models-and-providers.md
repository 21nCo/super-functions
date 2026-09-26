---
title: Models and providers
description: Select first-party capabilities and preserve provider messages.
---

# Models and providers

The current TypeScript source includes first-party chat adapters for OpenAI, Anthropic, Ollama, Google, and Mistral, plus mock and custom model interfaces. The [compatibility matrix](/docs/reference/compatibility) distinguishes completion, chat, streaming, tools, embeddings, and evaluation. Only OpenAI ships a first-party embeddings adapter in this release line. Ollama has streaming but no first-party tool mapping.

Provider `timeout` is a total response deadline, including streaming bodies, in milliseconds. Set `0` only when intentionally disabling it. Cancellation remains independent. For Google tool continuations, persist the returned assistant `message`, including `providerData`, before appending tool results; streamed chat emits a `message` event for the same purpose. `stream` is the prompt-only convenience method.

The Google TypeScript adoption includes native SSE and signed tool continuation, but live Gemini qualification is a separate release gate. Python has not been migrated into this `origin/dev` worktree. Use the [source model exports](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/models/index.ts) for concrete constructors and options.
