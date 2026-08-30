import { createRoot, createSignal, type Accessor } from "solid-js";
import type { AdapterSnapshot } from "@mdfn/adapter-kit";
import { describe, expect, it } from "vitest";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { createMdfnSignal } from "./index";
import { MdfnEditor } from "./index";
import { render } from "solid-js/web";

describe("@mdfn/solid", () => {
  it("updates and tears down its shared-state signal", () => {
    const controller = createEditor({ markdown: "one", projector: createMarkdownProjector() });
    let dispose = (): void => {};
    let snapshot: Accessor<AdapterSnapshot> | undefined;
    createRoot((cleanup) => {
      dispose = cleanup;
      snapshot = createMdfnSignal(controller);
    });
    expect(snapshot?.().markdown).toBe("one");
    controller.dispatch(new Transaction().replaceSource(0, 3, "two").withSource("parity"));
    expect(snapshot?.().markdown).toBe("two");
    dispose();
    controller.dispatch(new Transaction().replaceSource(0, 3, "end").withSource("cleanup"));
    expect(snapshot?.().markdown).toBe("two");
  });

  it("moves a shared-state signal to a replacement controller", () => {
    const first = createEditor({ markdown: "first", projector: createMarkdownProjector() });
    const second = createEditor({ markdown: "second", projector: createMarkdownProjector() });
    let dispose = (): void => {};
    let setController!: (controller: typeof first) => void;
    let snapshot: Accessor<AdapterSnapshot> | undefined;
    createRoot((cleanup) => {
      dispose = cleanup;
      const [controller, updateController] = createSignal(first);
      setController = updateController;
      snapshot = createMdfnSignal(controller);
    });

    setController(second);
    expect(snapshot?.().markdown).toBe("second");
    first.dispatch(new Transaction().replaceSource(0, 5, "stale"));
    expect(snapshot?.().markdown).toBe("second");
    second.dispatch(new Transaction().replaceSource(0, 6, "active"));
    expect(snapshot?.().markdown).toBe("active");
    dispose();
  });

  it("mounts the real adapter, replays controller changes, and cleans up", async () => {
    const controller = createEditor({ markdown: "# Mounted", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    document.body.append(target);
    let ready = (): void => {};
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const dispose = render(() => <MdfnEditor controller={controller} mode="read-only" editorRef={(handle) => { if (handle) ready(); }} />, target);
    await readyPromise;
    await Promise.resolve();
    expect(target.querySelector('[data-mdfn-solid="editor"]')).not.toBeNull();
    controller.dispatch(new Transaction().replaceSource(2, 9, "Changed").withSource("parity"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.textContent).toContain("Changed");
    dispose();
    expect(target.children).toHaveLength(0);
  });

  it("reacts to controller, read-only, label, and ref prop changes after async loading", async () => {
    const controller = createEditor({ markdown: "first", projector: createMarkdownProjector() });
    const alternate = createEditor({ markdown: "second", projector: createMarkdownProjector() });
    const [active, setActive] = createSignal(controller);
    const [readOnly, setReadOnly] = createSignal(false);
    const [ariaLabel, setAriaLabel] = createSignal("Initial editor");
    const [refVersion, setRefVersion] = createSignal(0);
    const target = document.createElement("div");
    document.body.append(target);
    const dispose = render(() => (
      <MdfnEditor
        controller={active()}
        mode="source"
        readOnly={readOnly()}
        ariaLabel={ariaLabel()}
        editorRef={(value) => { if (value) void refVersion(); }}
      />
    ), target);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.querySelector('[aria-label="Initial editor source"]')).not.toBeNull();
    setReadOnly(true);
    setAriaLabel("Updated editor");
    setRefVersion((value) => value + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.querySelector('[aria-label="Updated editor source"]')).not.toBeNull();
    expect(target.querySelector('[contenteditable="false"]')).not.toBeNull();
    setActive(alternate);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(target.textContent).toContain("second");
    dispose();
  });
});
