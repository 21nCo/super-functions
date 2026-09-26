---
title: Getting started
description: Create a headless editor controller from Markdown.
---

# Getting started

The curated headless facade combines core transactions, Markdown parsing, rendering, and built-in extensions.

```ts
import { createMdfn } from "@mdfn/facade";

const editor = createMdfn({ markdown: "# Hello\n\nStart writing.\n" });
const state = editor.getState();
```

Use the controller as the common model for a browser editor, source view, or server workflow. The default extension set handles the standard authoring profile; pass `markdownOptions` to choose a CommonMark-only dialect or a configured extension set. Read the [facade](/docs/reference/facade), [core](/docs/reference/core), and [Markdown](/docs/reference/markdown) package guides for boundaries and exports.

For a complete mounted workflow, run one of the [React, Svelte, or Solid example apps](/docs/reference/examples).
