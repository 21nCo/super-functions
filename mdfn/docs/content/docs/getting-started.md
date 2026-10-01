---
title: Getting started
description: Install MDFN, edit Markdown, observe changes, and release the controller.
---

```sh
npm install @mdfn/facade
```

The headless facade combines the controller, Markdown parser, rendering helpers, and built-in extensions. It does not mount a browser editor or persist documents automatically.

```ts
import { createMdfn, Transaction } from "@mdfn/facade";

const editor = createMdfn({ markdown: "# Hello\n\nStart writing.\n" });
const unsubscribe = editor.subscribe(({ current }) => {
  console.log(current.markdown, current.dirty);
});
editor.dispatch(new Transaction().replaceSource(2, 7, "Welcome"));
console.log(editor.getState().markdown); // # Welcome followed by the original body
editor.undo();
editor.redo();

// Only after the corresponding source/sidecar has been saved successfully:
editor.markSaved();
unsubscribe();
editor.destroy();
```

Source offsets are JavaScript string offsets. Subscribe for changes rather than modifying state objects. `getState()` exposes Markdown, parsed document, selection, sidecar, version, and dirty state. A destroyed controller cannot be reused; create one per editor lifetime.

The default extension set handles the standard authoring profile. Pass `markdownOptions: { dialect: "commonmark" }` for CommonMark-only behavior, or supply a configured extension set. Keep that configuration consistent between browser and server.

Next, [mount a framework editor](/docs/framework-editors), then [persist documents](/docs/server-and-storage). Source preservation and rendering security are covered in [source preservation](/docs/source-preservation) and [rendering](/docs/rendering-and-security).
