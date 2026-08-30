import { describe, expect, it, vi } from "vitest";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { createMdfnStore } from "../src/store";
import { mount, tick, unmount } from "svelte";
import MdfnEditor from "../src/MdfnEditor.svelte";
import ReactiveHarness from "./ReactiveHarness.svelte";

const sourceMount = vi.hoisted(() => ({ failNext: false }));
const domMount = vi.hoisted(() => ({ destroy: vi.fn() }));

vi.mock("@mdfn/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mdfn/dom")>();
  return {
    ...actual,
    createDomEditor: (...args: Parameters<typeof actual.createDomEditor>) => {
      const editor = actual.createDomEditor(...args);
      const destroy = editor.destroy.bind(editor);
      editor.destroy = () => { domMount.destroy(); destroy(); };
      return editor;
    },
  };
});

vi.mock("@mdfn/source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mdfn/source")>();
  return {
    ...actual,
    createSourceEditor: (...args: Parameters<typeof actual.createSourceEditor>) => {
      if (sourceMount.failNext) {
        sourceMount.failNext = false;
        throw new Error("transient source mount failure");
      }
      return actual.createSourceEditor(...args);
    },
  };
});

describe("@mdfn/svelte", () => {
  it("updates and tears down its shared-state store", () => {
    const controller = createEditor({ markdown: "one", projector: createMarkdownProjector() });
    const store = createMdfnStore(controller);
    const values: string[] = [];
    const unsubscribe = store.subscribe((snapshot) => values.push(snapshot.markdown));
    controller.dispatch(new Transaction().replaceSource(0, 3, "two").withSource("parity"));
    expect(values).toEqual(["one", "two"]);
    unsubscribe();
    controller.dispatch(new Transaction().replaceSource(0, 3, "end").withSource("cleanup"));
    expect(values).toEqual(["one", "two"]);
    const resumed: string[] = [];
    const stopResumed = store.subscribe((snapshot) => resumed.push(snapshot.markdown));
    controller.dispatch(new Transaction().replaceSource(0, 3, "back").withSource("resubscribe"));
    expect(resumed).toEqual(["end", "back"]);
    stopResumed();
  });

  it("mounts the real adapter, replays controller changes, and cleans up", async () => {
    const controller = createEditor({ markdown: "# Mounted", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    document.body.append(target);
    let ready = (): void => {};
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const component = mount(MdfnEditor, { target, props: { controller, mode: "read-only", editorRef: (handle) => { if (handle) ready(); } } });
    await readyPromise;
    await tick();
    expect(target.querySelector('[data-mdfn-svelte="editor"]')).not.toBeNull();
    controller.dispatch(new Transaction().replaceSource(2, 9, "Changed").withSource("parity"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    expect(target.textContent).toContain("Changed");
    await unmount(component);
    expect(target.children).toHaveLength(0);
  });

  it("reacts to controller, read-only, label, and ref prop changes after async loading", async () => {
    const controller = createEditor({ markdown: "first", projector: createMarkdownProjector() });
    const alternate = createEditor({ markdown: "second", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(ReactiveHarness, { target, props: { controller, alternate } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    expect(target.querySelector('[aria-label="Initial editor source"]')).not.toBeNull();
    component.updateSurface();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    expect(target.querySelector('[aria-label="Updated editor source"]')).not.toBeNull();
    expect(target.querySelector('[contenteditable="false"]')).not.toBeNull();
    component.useAlternate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    expect(target.textContent).toContain("second");
    await unmount(component);
  });

  it("recovers from a transient load failure when a new mount is requested", async () => {
    const controller = createEditor({ markdown: "first", projector: createMarkdownProjector() });
    const alternate = createEditor({ markdown: "second", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    document.body.append(target);
    sourceMount.failNext = true;
    const component = mount(ReactiveHarness, { target, props: { controller, alternate } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    expect(target.querySelector('[data-mdfn-source-fallback="true"]')).not.toBeNull();
    expect(target.textContent).toContain("transient source mount failure");

    component.updateSurface();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await tick();
    expect(target.querySelector('[data-mdfn-source-fallback="true"]')).toBeNull();
    expect(target.querySelector('[aria-label="Updated editor source"]')).not.toBeNull();
    await unmount(component);
  });

  it("destroys a partially mounted visual editor when split-mode source loading fails", async () => {
    const controller = createEditor({ markdown: "first", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    document.body.append(target);
    domMount.destroy.mockClear();
    sourceMount.failNext = true;
    const component = mount(MdfnEditor, { target, props: { controller, mode: "split" } });

    await vi.waitFor(() => {
      expect(target.querySelector('[data-mdfn-source-fallback="true"]')).not.toBeNull();
      expect(domMount.destroy).toHaveBeenCalledOnce();
    });
    await unmount(component);
  });
});
