---
title: "@mdfn/solid"
description: Mount a Solid editor and observe its reactive snapshot.
---

# Solid

```sh
npm install @mdfn/facade @mdfn/solid
```

```tsx
import { onCleanup } from "solid-js";
import { createMdfn } from "@mdfn/facade";
import { MdfnEditor, createMdfnSignal } from "@mdfn/solid";

export function DocumentEditor() {
  const controller = createMdfn({ markdown: "# New document\n" });
  const snapshot = createMdfnSignal(controller);
  onCleanup(() => controller.destroy());
  return <>
    <MdfnEditor controller={controller} mode="split" ariaLabel="Document editor"
      onLoadError={(error) => console.error(error)} />
    <output>{snapshot().dirty ? "Unsaved changes" : "Saved"}</output>
  </>;
}
```

`createMdfnSignal` accepts a controller or an accessor and cleans up its bridge with the Solid owner. Call it inside a component or reactive root. `MdfnEditor` supports `mode`, `readOnly`, `ariaLabel`, `onLoadError`, `onFiles`, and `editorRef` alongside div attributes. The host owns controller cleanup. See [persistence](/docs/server-and-storage).
