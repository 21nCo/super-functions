---
title: Getting started
description: Create a TypeScript client and run a deterministic model call.
---

# Getting started

The TypeScript package is named `langfn` and exports a root client plus named subpaths. The current source manifest targets `0.1.0`; build or pack this checkout when testing the unpublished dev contract.

```ts
import { langfn } from "langfn";
import { MockChatModel } from "langfn/models";
import { PromptTemplate } from "langfn/prompts";

const client = langfn({
  model: new MockChatModel({ responses: ["Hello Ada"] }),
});

const prompt = new PromptTemplate({ template: "Say hi to {name}" });
const response = await client.complete(prompt.format({ name: "Ada" }));
console.log(response.content);
```

Use `MockChatModel` for deterministic setup and tests. Choose a real provider from [models and providers](/docs/models-and-providers), supply its credentials from a trusted host, and configure total response deadlines for network calls. The [package export map](/docs/reference/package-exports) lists the subpaths available from the current manifest.
