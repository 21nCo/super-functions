import { createEditor } from "@mdfn/core";
import { createDomEditor, sanitizePastedHtml } from "@mdfn/dom";
import { createMarkdownProjector } from "@mdfn/markdown";
import React from "react";
import { createRoot } from "react-dom/client";
import { mount, unmount } from "svelte";
import { createComponent } from "solid-js";
import { render as renderSolid } from "solid-js/web";
import { MdfnEditor as ReactEditor } from "@mdfn/react";
import { MdfnEditor as SvelteEditor } from "@mdfn/svelte";
import { MdfnEditor as SolidEditor } from "@mdfn/solid";

const controller = createEditor({ markdown: "# Browser\n\nEditable text.\n", projector: createMarkdownProjector() });
const files: string[] = [];
let editor: ReturnType<typeof createDomEditor>;
editor = createDomEditor({
  target: document.querySelector<HTMLElement>("#editor")!,
  controller,
  attributes: { "aria-label": "Browser verification editor" },
  onFiles(incoming) {
    for (const file of incoming) files.push(file.name);
    editor.insertMarkdown(`[${incoming[0]?.name ?? "asset"}](https://assets.example.test/file)\n`);
  },
});

async function actualAdapterParity() {
  const readyWithin = (framework: string, ready: Promise<void>) => Promise.race([
    ready,
    new Promise<void>((_, reject) => {
      window.setTimeout(() => reject(new Error(`MDFN_BROWSER_${framework.toUpperCase()}_READY_TIMEOUT`)), 5_000);
    }),
  ]);
  const projector = createMarkdownProjector();
  const initial = "# Parity\n";
  const hosts = ["vanilla", "react", "svelte", "solid"].map((framework) => {
    const target = document.createElement("div");
    target.dataset.parity = framework;
    document.body.append(target);
    return { framework, target, controller: createEditor({ markdown: initial, projector }), trace: [] as unknown[] };
  });
  for (const entry of hosts) {
    const capture = () => {
      const state = entry.controller.getState();
      entry.trace.push({ version: state.version, markdown: state.markdown, selection: state.selection, diagnostics: state.diagnostics.map((item) => item.code) });
    };
    capture();
    entry.controller.subscribe(capture);
  }
  const vanilla = createDomEditor({ target: hosts[0].target, controller: hosts[0].controller });
  let reactHandle: Parameters<NonNullable<React.ComponentProps<typeof ReactEditor>["onReady"]>>[0] | undefined;
  let svelteHandle: Parameters<NonNullable<import("@mdfn/svelte").MdfnEditorProps["editorRef"]>>[0] | undefined;
  let solidHandle: Parameters<NonNullable<import("@mdfn/solid").MdfnEditorProps["editorRef"]>>[0] | undefined;
  const reactReady = new Promise<void>((resolve) => {
    const root = createRoot(hosts[1].target);
    Object.assign(hosts[1], { cleanup: () => root.unmount() });
    root.render(React.createElement(ReactEditor, { controller: hosts[1].controller, onReady: (handle) => { reactHandle = handle; resolve(); } }));
  });
  let svelteInstance: ReturnType<typeof mount>;
  const svelteReady = new Promise<void>((resolve) => {
    svelteInstance = mount(SvelteEditor, { target: hosts[2].target, props: { controller: hosts[2].controller, editorRef: (handle) => { if (handle) { svelteHandle = handle; resolve(); } } } });
  });
  let disposeSolid = () => {};
  const solidReady = new Promise<void>((resolve) => {
    disposeSolid = renderSolid(() => createComponent(SolidEditor, { controller: hosts[3].controller, editorRef: (handle) => { if (handle) { solidHandle = handle; resolve(); } } }), hosts[3].target);
  });
  await Promise.all([
    readyWithin("react", reactReady),
    readyWithin("svelte", svelteReady),
    readyWithin("solid", solidReady),
  ]);
  const drivers = [vanilla, reactHandle!, svelteHandle!, solidHandle!];
  for (const driver of drivers) {
    if (!driver.insertMarkdown("\nParity")) throw new Error("MDFN_ADAPTER_PARITY_INSERT_FAILED");
    if (!driver.run("undo") || !driver.run("redo")) throw new Error("MDFN_ADAPTER_PARITY_HISTORY_FAILED");
  }
  const reference = JSON.stringify(hosts[0].trace);
  const mismatches = hosts.filter((entry) => JSON.stringify(entry.trace) !== reference).map((entry) => entry.framework);
  vanilla.destroy();
  (hosts[1] as typeof hosts[number] & { cleanup: () => void }).cleanup();
  await unmount(svelteInstance!);
  disposeSolid();
  for (const entry of hosts) { entry.controller.destroy(); entry.target.remove(); }
  return { ok: mismatches.length === 0, mismatches, steps: hosts[0].trace.length };
}

Object.assign(globalThis, {
  __MDFN_BROWSER__: {
    markdown: () => controller.getState().markdown,
    files: () => [...files],
    sanitize: (html: string) => sanitizePastedHtml(html),
    adapterParity: actualAdapterParity,
    destroy: () => { editor.destroy(); controller.destroy(); },
  },
});
document.querySelector("#status")!.textContent = "ready";
