---
title: "@mdfn/dom"
description: Mount and dispose a vanilla browser editor.
---

```sh
npm install @mdfn/facade @mdfn/dom
```

Add `<div id="editor"></div>` to the page and run this in a browser entrypoint after the element exists:

```ts
import { createMdfn } from "@mdfn/facade";
import { createDomEditor } from "@mdfn/dom";

const target = document.querySelector<HTMLElement>("#editor");
if (!target) throw new Error("Editor container is missing");
const controller = createMdfn({ markdown: "# New document\n" });
const view = createDomEditor({ target, controller, attributes: { "aria-label": "Document editor" } });
view.focus();

export function dispose() {
  view.destroy();
  controller.destroy();
}
```

Call `dispose()` when the host removes the owning view. Do not destroy the editor on `pagehide`: a page kept in the back/forward cache can be restored without running setup again. `createDomEditor` is browser-only; dynamically import it after mount in an SSR host. Its options include `readOnly`, `attributes`, `onFocus`, `onBlur`, and `onFiles`. The returned editor provides `run`, `can`, link/table/Markdown commands, `focus`, `setReadOnly`, and `destroy`. Call `can(command)` before enabling toolbar actions. Persist the controller's Markdown and sidecar rather than ProseMirror internals.
