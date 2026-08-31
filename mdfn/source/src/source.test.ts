// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEditor, Transaction, type MdfnExtension } from "@mdfn/core";
import { undoDepth, redoDepth } from "@codemirror/commands";
import { runScopeHandlers } from "@codemirror/view";
import { createMarkdownProjector } from "@mdfn/markdown";
import { createModeController, createPreview, createSourceEditor, sourceInternals } from "./index";

describe("@mdfn/source", () => {
  it("synchronizes CodeMirror changes through the shared controller", () => {
    const controller = createEditor({
      markdown: "# Source\n",
      projector: createMarkdownProjector(),
      selection: { kind: "text", anchor: 2, head: 2 },
    });
    const target = document.createElement("div");
    document.body.append(target);
    const editor = createSourceEditor({ target, controller });
    expect(editor.view.state.selection.main).toMatchObject({ anchor: 2, head: 2 });
    controller.dispatch(
      new Transaction()
        .replaceSource(2, 8, "Changed")
        .setSelection({ kind: "text", anchor: 9, head: 9 })
        .withSource("external"),
    );
    expect(editor.view.state.doc.toString()).toBe("# Changed\n");
    expect(editor.view.state.selection.main).toMatchObject({ anchor: 9, head: 9 });
    expect(createPreview(controller).html).toContain("Changed");

    editor.view.dispatch({
      changes: { from: 10, insert: "\nMore" },
      selection: { anchor: 15, head: 15 },
    });
    expect(controller.getState().markdown).toBe("# Changed\n\nMore");
    expect(controller.getState().selection).toEqual({ kind: "text", anchor: 15, head: 15 });
    editor.destroy();
  });

  it("preserves disjoint CodeMirror changes as separate source operations", () => {
    const controller = createEditor({
      markdown: "abcde",
      projector: createMarkdownProjector(),
      sidecar: {
        comments: [{
          id: "comment",
          anchor: { from: 2, to: 3 },
          resolved: false,
          messages: [{ id: "message", authorId: "reviewer", body: "Keep this range", createdAt: "2026-08-30T00:00:00.000Z" }],
        }],
      },
    });
    const editor = createSourceEditor({ target: document.createElement("div"), controller });
    editor.view.dispatch({ changes: [{ from: 0, to: 1, insert: "A" }, { from: 4, to: 5, insert: "E" }] });
    expect(controller.getState().markdown).toBe("AbcdE");
    expect(controller.getState().sidecar?.comments?.[0]?.anchor).toEqual({ from: 2, to: 3 });
    editor.destroy();
  });

  it("rolls CodeMirror back to canonical state when a source edit is rejected", () => {
    const controller = createEditor({
      markdown: "1234",
      projector: createMarkdownProjector({ maxBytes: 4 }),
      selection: { kind: "text", anchor: 4, head: 4 },
    });
    const editor = createSourceEditor({ target: document.createElement("div"), controller });

    editor.view.dispatch({ changes: { from: 4, insert: "5" }, selection: { anchor: 5 } });
    expect(controller.getState().markdown).toBe("1234");
    expect(editor.view.state.doc.toString()).toBe("1234");
    expect(editor.view.state.selection.main).toMatchObject({ anchor: 4, head: 4 });

    editor.view.dispatch({ changes: { from: 3, to: 4, insert: "x" } });
    expect(controller.getState().markdown).toBe("123x");
    expect(editor.view.state.doc.toString()).toBe("123x");
    editor.destroy();
  });

  it("provides deterministic mode state", () => {
    const modes = createModeController();
    modes.setMode("split");
    expect(modes.getMode()).toBe("split");
    modes.destroy();
  });

  it("uses controller history as the only source-mode history", () => {
    const controller = createEditor({ markdown: "a", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const editor = createSourceEditor({ target, controller });
    editor.view.dispatch({ changes: { from: 1, insert: "b" } });
    expect(controller.getState().markdown).toBe("ab");
    expect(controller.canUndo()).toBe(true);
    expect(undoDepth(editor.view.state)).toBe(0);
    expect(controller.undo()).toBe(true);
    expect(editor.view.state.doc.toString()).toBe("a");
    expect(redoDepth(editor.view.state)).toBe(0);
    expect(controller.redo()).toBe(true);
    expect(editor.view.state.doc.toString()).toBe("ab");
    editor.destroy();
  });

  it("does not dispatch controller history shortcuts while read-only", () => {
    const controller = createEditor({ markdown: "a", projector: createMarkdownProjector() });
    controller.dispatch(new Transaction().replaceSource(1, 1, "b"));
    const target = document.createElement("div");
    const editor = createSourceEditor({ target, controller, readOnly: true });
    const runUndoShortcut = (): void => {
      runScopeHandlers(editor.view, new KeyboardEvent("keydown", { key: "z", metaKey: true }), "editor");
      if (controller.getState().markdown === "ab") runScopeHandlers(editor.view, new KeyboardEvent("keydown", { key: "z", ctrlKey: true }), "editor");
    };

    runUndoShortcut();
    expect(controller.getState().markdown).toBe("ab");
    editor.setReadOnly(false);
    runUndoShortcut();
    expect(controller.getState().markdown).toBe("a");
    editor.destroy();
  });

  it("blocks editing keymaps while read-only and enables them after reconfiguration", () => {
    const controller = createEditor({ markdown: "item", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const editor = createSourceEditor({ target, controller, readOnly: true });
    editor.view.dispatch({ selection: { anchor: 0, head: 4 } });

    expect(editor.view.state.readOnly).toBe(true);
    runScopeHandlers(editor.view, new KeyboardEvent("keydown", { key: "Tab" }), "editor");
    expect(editor.view.state.doc.toString()).toBe("item");
    expect(controller.getState().markdown).toBe("item");

    editor.setReadOnly(false);
    expect(editor.view.state.readOnly).toBe(false);
    runScopeHandlers(editor.view, new KeyboardEvent("keydown", { key: "Tab" }), "editor");
    expect(editor.view.state.doc.toString()).toBe("  item");
    expect(controller.getState().markdown).toBe("  item");
    editor.destroy();
  });

  it("computes the smallest UTF-16 source replacement", () => {
    expect(sourceInternals.smallestSourceChange("prefix old suffix", "prefix new suffix")).toEqual({ from: 7, to: 10, insert: "new" });
    expect(sourceInternals.smallestSourceChange("👋 old", "👋 new")).toEqual({ from: 3, to: 6, insert: "new" });
    expect(sourceInternals.smallestSourceChange("same", "same")).toBeUndefined();
  });

  it("executes extension input rules in the source adapter", () => {
    const extension = {
      name: "source-rules",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" } as const,
      inputRules: [{ name: "arrow", match: /->/, replace: () => "→" }],
    };
    const controller = createEditor({ markdown: "", projector: createMarkdownProjector({ extensions: [extension] }), extensions: [extension] });
    const target = document.createElement("div");
    const editor = createSourceEditor({ target, controller });
    editor.view.dispatch({ changes: { from: 0, insert: "->" }, selection: { anchor: 2, head: 2 } });
    expect(controller.getState()).toMatchObject({ markdown: "→", selection: { kind: "text", anchor: 1, head: 1 } });
    expect(editor.view.state.doc.toString()).toBe("→");
    editor.destroy();
  });

  it("renders previews with controller extensions unless the policy overrides them", () => {
    const extension: MdfnExtension = {
      name: "preview-render",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" },
      render: ({ node }) => node.type === "heading"
        ? { tag: "aside", attrs: { class: "preview-extension" }, children: [{ tag: "strong", text: "Rendered" }] }
        : null,
    };
    const controller = createEditor({
      markdown: "# Preview\n",
      projector: createMarkdownProjector({ extensions: [extension] }),
      extensions: [extension],
    });

    expect(createPreview(controller).html).toContain('<aside class="preview-extension"><strong>Rendered</strong></aside>');
    expect(createPreview(controller, { extensions: [] }).html).not.toContain('class="preview-extension"');
  });
});
