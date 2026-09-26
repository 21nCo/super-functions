---
title: "@mdfn/react"
description: Mount a React editor and observe controller state.
---

```sh
npm install @mdfn/facade @mdfn/react
```

Use a client component. Creating the controller in the effect gives each mount its own lifetime, including React development-mode effect replay:

```tsx
"use client";
import { useEffect, useState } from "react";
import { createMdfn, type EditorController } from "@mdfn/facade";
import { MdfnEditor, useMdfn } from "@mdfn/react";

function EditorView({ controller }: { controller: EditorController }) {
  const snapshot = useMdfn(controller);
  return <>
    <MdfnEditor controller={controller} mode="split" ariaLabel="Document editor"
      onLoadError={(error) => console.error(error)} />
    <output>{snapshot.dirty ? "Unsaved changes" : "Saved"}</output>
  </>;
}

export default function DocumentEditor() {
  const [controller, setController] = useState<EditorController | null>(null);
  useEffect(() => {
    const editor = createMdfn({ markdown: "# New document\n" });
    setController(editor);
    return () => editor.destroy();
  }, []);
  return controller ? <EditorView controller={controller} /> : <p>Loading editor…</p>;
}
```

`useMdfn` subscribes to Markdown, dirty state, version, and undo/redo availability. The component accepts ordinary div attributes plus `controller`, `mode`, `readOnly`, `ariaLabel`, `onLoadError`, `onFiles`, and `onReady`. Its forwarded `MdfnEditorHandle` supports `focus`, `run`, `can`, link commands, `insertTable`, and `insertMarkdown`.

The controller belongs to the host, so preserve it when changing modes and destroy it only when the owning document view is removed. See [persistence](/docs/server-and-storage) before treating `markSaved()` as evidence of a durable save.
