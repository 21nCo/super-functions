// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { MdfnAuthoringChrome, MdfnEditorShell, MdfnToolbar } from "./index";

describe("React toolbar", () => {
  it("renders UIFn-owned chrome", () => {
    const controller = createEditor({ markdown: "# hi", projector: createMarkdownProjector() });
    const html = renderToStaticMarkup(<MdfnToolbar controller={controller} />);
    expect(html).toContain("data-uifn-component=\"toolbar\"");
    expect(html).toContain("data-mdfn-component=\"toolbar\"");
  });

  it("renders the complete responsive authoring surface with UIFn chrome", () => {
    const controller = createEditor({ markdown: "# Outline", projector: createMarkdownProjector() });
    const html = renderToStaticMarkup(<MdfnAuthoringChrome controller={controller} mode="read-only" readOnly />);
    expect(html).toContain('data-mdfn-component="authoring-chrome"');
    expect(html).toContain('data-mdfn-surface="outline"');
    expect(html).toContain('data-mdfn-surface="diagnostics"');
    expect(html).toContain('data-mdfn-surface="editorial"');
    expect(html).toContain('data-mdfn-surface="history"');
    expect(html).toContain('data-uifn-component="card"');
  });

  it("keeps the visual editor mounted after publishing its command target", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const controller = createEditor({ markdown: "# Mounted", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const root = createRoot(target);
    let ready = (): void => {};
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    await act(async () => {
      root.render(<MdfnEditorShell controller={controller} mode="visual" onSelectFiles={async () => undefined} onReady={ready} />);
    });
    await act(async () => { await readyPromise; });
    expect(target.querySelector('[data-mdfn-editor="visual"]')).not.toBeNull();
    await act(async () => { controller.dispatch(new Transaction().replaceSource(0, 0, "Updated ")); });
    expect(target.querySelector('[data-mdfn-editor="visual"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("runs contextual editorial and version workflows", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const controller = createEditor({ markdown: "text", projector: createMarkdownProjector(), selection: { kind: "text", anchor: 0, head: 4 } });
    const target = document.createElement("div");
    const root = createRoot(target);
    const restore = vi.fn();
    await act(async () => root.render(<MdfnAuthoringChrome controller={controller} versions={[{ version: 1, authorId: "author" }]} onRestoreVersion={restore} />));
    expect(target.querySelector('[data-mdfn-surface="bubble-toolbar"]')).not.toBeNull();
    expect(target.querySelector('[data-mdfn-surface="floating-toolbar"]')).toBeNull();
    const update = async (label: string, value: string): Promise<void> => {
      const input = target.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await update("Comment", "Review this");
    await act(async () => (Array.from(target.querySelectorAll("button")).find((button) => button.textContent === "Add comment") as HTMLButtonElement).click());
    const thread = controller.getState().sidecar?.comments?.[0];
    expect(thread?.messages[0]?.body).toBe("Review this");
    await update(`Reply to comment ${thread!.id}`, "Reply");
    await act(async () => (Array.from(target.querySelectorAll("button")).find((button) => button.textContent === "Reply") as HTMLButtonElement).click());
    expect(controller.getState().sidecar?.comments?.[0]?.messages).toHaveLength(2);
    await act(async () => (Array.from(target.querySelectorAll("button")).find((button) => button.textContent === "Resolve") as HTMLButtonElement).click());
    expect(controller.getState().sidecar?.comments?.[0]?.resolved).toBe(true);
    await update("Suggestion replacement", "replacement");
    await act(async () => (Array.from(target.querySelectorAll("button")).find((button) => button.textContent === "Add suggestion") as HTMLButtonElement).click());
    expect(controller.getState().sidecar?.suggestions?.[0]?.replacement).toBe("replacement");
    await act(async () => (Array.from(target.querySelectorAll("button")).find((button) => button.textContent === "Restore") as HTMLButtonElement).click());
    expect(restore).toHaveBeenCalledWith(1);
    await act(async () => root.unmount());
  });

  it("inserts selected-file Markdown through the controller without a visual surface", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const controller = createEditor({
      markdown: "before",
      projector: createMarkdownProjector(),
      selection: { kind: "text", anchor: 6, head: 6 },
    });
    const target = document.createElement("div");
    const root = createRoot(target);
    await act(async () => root.render(
      <MdfnAuthoringChrome controller={controller} mode="source" onSelectFiles={async () => "![asset](mdfn-asset:filefn/id)"} />,
    ));
    const input = target.querySelector<HTMLInputElement>('[aria-label="Select files"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "x.png", { type: "image/png" })] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(controller.getState().markdown).toBe("before![asset](mdfn-asset:filefn/id)");
    await act(async () => root.unmount());
  });
});
