// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { MdfnEditor } from "./index";

vi.mock("@mdfn/dom", () => ({
  createDomEditor() {
    throw new Error("visual editor failed to load");
  },
}));

describe("@mdfn/react", () => {
  it("binds the shared controller without framework-owned semantics", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const controller = createEditor({ markdown: "# React\n", projector: createMarkdownProjector() });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => { root.render(<MdfnEditor controller={controller} mode="source" />); });
    expect(host.querySelector('[data-mdfn-react="editor"]')).not.toBeNull();
    await act(async () => { root.unmount(); });
  });

  it("is SSR-safe and mounts under Strict Mode with canonical updates", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const controller = createEditor({ markdown: "# Before", projector: createMarkdownProjector() });
    const serverHtml = renderToString(<MdfnEditor controller={controller} mode="read-only" />);
    expect(serverHtml).toContain('data-mdfn-react="editor"');
    const host = document.createElement("div");
    host.innerHTML = serverHtml;
    let ready = (): void => {};
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(host, <React.StrictMode><MdfnEditor controller={controller} mode="read-only" onReady={ready} /></React.StrictMode>); });
    await act(async () => { await readyPromise; });
    await act(async () => { controller.dispatch(new Transaction().replaceSource(2, 8, "After").withSource("parity")); });
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toContain("After");
    await act(async () => { root!.unmount(); });
    expect(host.children).toHaveLength(0);
  });

  it("restores fallback source text when the controller rejects an edit", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const controller = createEditor({ markdown: "ok", projector: createMarkdownProjector({ maxBytes: 4 }) });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => {
      root.render(<MdfnEditor controller={controller} mode="visual" />);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const textarea = host.querySelector("textarea")!;
    expect(textarea).not.toBeNull();

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "invalid");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(controller.getState().markdown).toBe("ok");
    expect(textarea.value).toBe("ok");
    await act(async () => { root.unmount(); });
  });
});
