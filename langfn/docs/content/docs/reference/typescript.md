---
title: TypeScript package
description: Current langfn TypeScript package guide.
---

LangFn for TypeScript ships the canonical `langfn` package plus the documented subpath exports used throughout the SDK examples and tests.

Current release target: `0.1.0`.

## Install

```bash
npm install langfn@0.1.0
```

Python is outside this TypeScript source adoption. This site does not prescribe a Python registry installation; inspect its separately maintained source and release line.

## Supported imports

```typescript
import { LangFn, langfn } from "langfn";
import { OpenAIChatModel, MockChatModel } from "langfn/models";
import { PromptTemplate } from "langfn/prompts";
import { createLangFnRouter } from "langfn/http";
import { ReActAgent } from "langfn/agents";
```

## Quick start

```typescript
import { langfn } from "langfn";
import { MockChatModel } from "langfn/models";
import { PromptTemplate } from "langfn/prompts";

const client = langfn({
  model: new MockChatModel({ responses: ["Hello Ada"] })
});

const prompt = new PromptTemplate({ template: "Say hi to {name}" });
const response = await client.complete(prompt.format({ name: "Ada" }));

console.log(response.content);
```

## Release checks

From the repository root:

```bash
npm --prefix langfn/typescript run build
npm --prefix langfn/typescript test
npm run gate:langfn-release
```

## Compatibility

See [Provider compatibility](/docs/reference/compatibility) for first-party provider support across completion, chat, streaming, tools, embeddings, and evaluation.

CLI schema discovery is not supported: this package does not export the shared
`getSchema` contract. Hosts must provision adapter tables explicitly.
