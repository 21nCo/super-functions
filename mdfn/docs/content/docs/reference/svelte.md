---
title: "@mdfn/svelte"
description: Mount a Svelte editor and subscribe with a readable store.
---

# Svelte

```sh
npm install @mdfn/facade @mdfn/svelte
```

```svelte
<script lang="ts">
  import { onDestroy } from "svelte";
  import { createMdfn } from "@mdfn/facade";
  import { MdfnEditor, createMdfnStore } from "@mdfn/svelte";

  const controller = createMdfn({ markdown: "# New document\n" });
  const snapshot = createMdfnStore(controller);
  onDestroy(() => controller.destroy());
</script>

<MdfnEditor {controller} mode="split" ariaLabel="Document editor"
  onLoadError={(error) => console.error(error)} />
<output>{$snapshot.dirty ? "Unsaved changes" : "Saved"}</output>
```

`createMdfnStore` returns a readable store and releases its subscription when unused. `MdfnEditor` accepts `controller`, `mode`, `readOnly`, `ariaLabel`, `class`, `onLoadError`, `onFiles`, and `editorRef`. `editorRef` receives the command handle on mount and `null` during teardown. Use `controller.undo()` and `controller.redo()` for history and the handle for editor focus and visual commands.

Create a controller per document/view. In SvelteKit, browser editor dependencies load after mount; avoid sharing a mutable controller between server requests. See [persistence](/docs/server-and-storage).
