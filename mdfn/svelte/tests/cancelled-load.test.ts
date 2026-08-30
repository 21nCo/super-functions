import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { mount, tick, unmount } from "svelte";
import MdfnEditor from "../src/MdfnEditor.svelte";

const deferredImport = vi.hoisted(() => {
  let rejectImport: ((error: Error) => void) | undefined;
  return {
    requested: false,
    release(error: Error) { rejectImport?.(error); },
    wait() {
      deferredImport.requested = true;
      return new Promise<never>((_resolve, reject) => { rejectImport = reject; });
    },
  };
});

vi.mock("@mdfn/source", () => deferredImport.wait());

describe("@mdfn/svelte cancelled loading", () => {
  it("ignores a deferred preview-module rejection after unmount", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const onLoadError = vi.fn();
    const editorRef = vi.fn();
    const component = mount(MdfnEditor, {
      target,
      props: {
        controller: createEditor({ markdown: "body", projector: createMarkdownProjector() }),
        mode: "preview",
        onLoadError,
        editorRef,
      },
    });
    await vi.waitFor(() => expect(deferredImport.requested).toBe(true));

    await unmount(component);
    deferredImport.release(new Error("late source import failure"));
    await Promise.resolve();
    await tick();

    expect(onLoadError).not.toHaveBeenCalled();
    expect(editorRef).toHaveBeenLastCalledWith(null);
    expect(target.children).toHaveLength(0);
  });
});
