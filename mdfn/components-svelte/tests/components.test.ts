import { describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import MdfnEditorShell from "../src/MdfnEditorShell.svelte";
import MdfnAuthoringChrome from "../src/MdfnAuthoringChrome.svelte";

describe("Svelte authoring components", () => {
  it("mounts UIFn chrome and every read-only authoring surface", async () => {
    const controller = createEditor({ markdown: "# Outline", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const component = mount(MdfnEditorShell, { target, props: { controller, mode: "read-only" } });
    await tick();
    expect(target.querySelector('[data-mdfn-component="authoring-chrome"]')).not.toBeNull();
    expect(target.querySelector('[data-mdfn-surface="outline"]')?.textContent).toContain("Outline");
    expect(target.querySelector('[data-uifn-component="card"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="Select files"]')).toBeNull();
    expect(Array.from(target.querySelectorAll("button")).some((button) => button.textContent === "Add comment")).toBe(false);
    await unmount(component);
    expect(target.children).toHaveLength(0);
  });

  it("uses an uncontrolled native file input", async () => {
    const controller = createEditor({ markdown: "# Files", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const component = mount(MdfnEditorShell, { target, props: { controller, mode: "visual", onSelectFiles: async () => undefined } });
    await tick();
    const input = target.querySelector<HTMLInputElement>('input[type="file"][aria-label="Select files"]');
    expect(input).not.toBeNull();
    expect(input?.hasAttribute("value")).toBe(false);
    expect(input?.dataset.uifnComponent).toBe("input");
    await unmount(component);
  });

  it("runs contextual editorial and version workflows", async () => {
    const controller = createEditor({ markdown: "text", projector: createMarkdownProjector(), selection: { kind: "text", anchor: 0, head: 4 } });
    const restore = vi.fn();
    const target = document.createElement("div");
    const component = mount(MdfnAuthoringChrome, { target, props: { controller, versions: [{ version: 1 }], onRestoreVersion: restore } });
    await tick();
    expect(target.querySelector('[data-mdfn-surface="bubble-toolbar"]')).not.toBeNull();
    expect(target.querySelector('[data-mdfn-surface="floating-toolbar"]')).toBeNull();
    const update = async (label: string, value: string): Promise<void> => {
      const input = target.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
    };
    const button = (label: string): HTMLButtonElement => Array.from(target.querySelectorAll("button")).find((candidate) => candidate.textContent === label) as HTMLButtonElement;
    await update("Comment", "Review this");
    button("Add comment").click();
    await tick();
    const thread = controller.getState().sidecar?.comments?.[0];
    await update(`Reply to comment ${thread!.id}`, "Reply");
    button("Reply").click();
    await tick();
    button("Resolve").click();
    await tick();
    expect(controller.getState().sidecar?.comments?.[0]).toMatchObject({ resolved: true, messages: expect.arrayContaining([expect.objectContaining({ body: "Reply" })]) });
    await update("Suggestion replacement", "replacement");
    button("Add suggestion").click();
    await tick();
    expect(controller.getState().sidecar?.suggestions?.[0]?.replacement).toBe("replacement");
    button("Restore").click();
    expect(restore).toHaveBeenCalledWith(1);
    await unmount(component);
  });

  it("inserts selected-file Markdown in source mode without a visual editor", async () => {
    const controller = createEditor({
      markdown: "before",
      projector: createMarkdownProjector(),
      selection: { kind: "text", anchor: 6, head: 6 },
    });
    const target = document.createElement("div");
    const component = mount(MdfnAuthoringChrome, {
      target,
      props: { controller, mode: "source", onSelectFiles: async () => "![asset](mdfn-asset:filefn/id)" },
    });
    await tick();
    const input = target.querySelector<HTMLInputElement>('[aria-label="Select files"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "x.png", { type: "image/png" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(controller.getState().markdown).toBe("before![asset](mdfn-asset:filefn/id)");
    await unmount(component);
  });

  it("anchors a pending file insertion to the original selection", async () => {
    const controller = createEditor({ markdown: "before after", projector: createMarkdownProjector(), selection: { kind: "text", anchor: 7, head: 12 } });
    let resolveUpload!: (markdown: string) => void;
    const target = document.createElement("div");
    const component = mount(MdfnAuthoringChrome, {
      target,
      props: { controller, mode: "source", onSelectFiles: () => new Promise((resolve) => { resolveUpload = resolve; }) },
    });
    await tick();
    const input = target.querySelector<HTMLInputElement>('[aria-label="Select files"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "x.png")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    controller.dispatch(new Transaction().replaceSource(0, 0, "prefix ").setSelection({ kind: "text", anchor: 0, head: 0 }));
    resolveUpload("asset");
    await tick();
    expect(controller.getState().markdown).toBe("prefix before asset");
    await unmount(component);
  });
});
