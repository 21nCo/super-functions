// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector, parseMarkdown } from "@mdfn/markdown";
import { commonmarkExtension, createDirectiveExtension } from "@mdfn/extensions";
import { EditorState, TextSelection } from "prosemirror-state";
import { createDomEditor, documentToProseMirror, proseMirrorToDocument } from "./index";

describe("@mdfn/dom", () => {
  it("projects documents without losing top-level source metadata", () => {
    const projector = createMarkdownProjector();
    const parsed = projector.parse("# Title\n\nParagraph.\n");
    const pm = documentToProseMirror(parsed.document);
    const roundTrip = proseMirrorToDocument(pm, pm);
    expect(roundTrip.content.map((node) => node.type)).toEqual(["heading", "paragraph"]);
    expect(roundTrip.content[0].source?.raw).toBe("# Title");
    expect(roundTrip.content[0].source?.dirty).toBe(false);
  });

  it("mounts a vanilla editor and dispatches shared controller changes", () => {
    const projector = createMarkdownProjector();
    const controller = createEditor({ markdown: "Text.\n", projector });
    const target = document.createElement("div");
    document.body.append(target);
    const editor = createDomEditor({ target, controller });
    expect(target.querySelector('[data-mdfn-editor="visual"]')).not.toBeNull();
    expect(target.querySelector('[role="textbox"][aria-multiline="true"]')).not.toBeNull();
    expect(editor.can("bold")).toBe(true);
    editor.setReadOnly(true);
    expect(editor.can("bold")).toBe(false);
    expect(editor.run("bold")).toBe(false);
    editor.destroy();
    expect(target.querySelector('[data-mdfn-editor="visual"]')).toBeNull();
  });

  it("uses controller history and selection as the only canonical authority", () => {
    const projector = createMarkdownProjector();
    const controller = createEditor({ markdown: "a\n", projector });
    const target = document.createElement("div");
    document.body.append(target);
    const editor = createDomEditor({ target, controller });
    editor.view.dispatch(editor.view.state.tr.insertText("b", 2));
    expect(controller.getState().markdown).toBe("ab\n");
    expect(controller.getState().selection?.kind).toBe("text");
    expect(editor.run("undo")).toBe(true);
    expect(controller.getState().markdown).toBe("a\n");
    expect(editor.view.state.doc.textContent).toBe("a");
    expect(editor.can("undo")).toBe(false);
    expect(editor.run("redo")).toBe(true);
    expect(controller.getState().markdown).toBe("ab\n");
    expect(editor.view.state.doc.textContent).toBe("ab");
    editor.destroy();
  });

  it("does not dispatch controller history shortcuts while read-only", () => {
    const controller = createEditor({ markdown: "a\n", projector: createMarkdownProjector() });
    controller.dispatch(new Transaction().replaceSource(1, 1, "b"));
    const target = document.createElement("div");
    const editor = createDomEditor({ target, controller, readOnly: true });
    const runUndoShortcut = (): void => {
      const dispatch = (event: KeyboardEvent): void => {
        editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
      };
      dispatch(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
      if (controller.getState().markdown === "ab\n") dispatch(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    };

    runUndoShortcut();
    expect(controller.getState().markdown).toBe("ab\n");
    editor.setReadOnly(false);
    runUndoShortcut();
    expect(controller.getState().markdown).toBe("a\n");
    editor.destroy();
  });

  it("blocks fallback visual keymaps and document transactions while read-only", () => {
    const controller = createEditor({ markdown: "Text\n", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const editor = createDomEditor({ target, controller, readOnly: true });
    editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 3)));
    const pressEnter = (): boolean | undefined => editor.view.someProp("handleKeyDown", (handler) => (
      handler(editor.view, new KeyboardEvent("keydown", { key: "Enter" }))
    ));

    expect(pressEnter()).toBeFalsy();
    expect(controller.getState().markdown).toBe("Text\n");
    expect(editor.view.state.doc.childCount).toBe(1);
    editor.view.dispatch(editor.view.state.tr.insertText("X", 3));
    expect(editor.view.state.doc.textContent).toBe("Text");

    editor.setReadOnly(false);
    expect(pressEnter()).toBe(true);
    expect(controller.getState().markdown).not.toBe("Text\n");
    expect(editor.view.state.doc.childCount).toBe(2);
    editor.destroy();
  });

  it("reconciles command-driven Markdown insertion into the visual view", () => {
    const controller = createEditor({
      markdown: "a\n",
      projector: createMarkdownProjector(),
      selection: { kind: "text", anchor: 1, head: 1 },
    });
    const target = document.createElement("div");
    const editor = createDomEditor({ target, controller });
    expect(editor.insertMarkdown("b")).toBe(true);
    expect(controller.getState().markdown).toBe("ab\n");
    expect(editor.view.state.doc.textContent).toBe("ab");
    editor.destroy();
  });

  it("maps visual selections through inline source spans instead of block delimiters", () => {
    const controller = createEditor({ markdown: "# Hello\n", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    const editor = createDomEditor({ target, controller });

    editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 6)));
    expect(controller.getState().selection).toEqual({ kind: "text", anchor: 7, head: 7 });

    controller.dispatch(new Transaction().setSelection({ kind: "text", anchor: 2, head: 2 }).withSource("external"));
    expect(editor.view.state.selection).toMatchObject({ anchor: 1, head: 1 });
    editor.destroy();
  });

  it("round-trips inline code from visual projection", () => {
    const projector = createMarkdownProjector();
    const source = "Use `value` here.\n";
    const parsed = projector.parse(source);
    const pm = documentToProseMirror(parsed.document);
    const visual = proseMirrorToDocument(pm, undefined);
    expect(projector.serialize(visual, source).markdown).toContain("`value`");
  });

  it("preserves table alignment and loose-list semantics through visual projection", () => {
    const source = "| Left | Right |\n| :--- | ---: |\n| A | B |\n\n- first\n\n- second\n";
    const parsed = parseMarkdown(source);
    const visual = documentToProseMirror(parsed.document);
    const roundTrip = proseMirrorToDocument(visual, visual);
    expect(roundTrip.content[0].attrs?.align).toEqual(["left", "right"]);
    expect(roundTrip.content[1].attrs?.spread).toBe(true);
  });

  it("does not retain stale raw source on visually edited nodes", () => {
    const parsed = parseMarkdown("Paragraph.\n");
    const before = documentToProseMirror(parsed.document);
    const state = EditorState.create({ schema: before.type.schema, doc: before });
    const after = state.apply(state.tr.insertText("Changed ", 1)).doc;
    const changed = proseMirrorToDocument(after, before);
    expect(changed.content[0].source).toMatchObject({ dirty: true });
    expect(changed.content[0].source).not.toHaveProperty("raw");
  });

  it("preserves unsupported inline source and reference links through nearby visual edits", () => {
    for (const source of [
      "before <custom-inline>inside</custom-inline> after\n",
      "[label][ref]\n\n[ref]: https://example.com\n",
    ]) {
      const projector = createMarkdownProjector({ dialect: "commonmark" });
      const parsed = projector.parse(source);
      const before = documentToProseMirror(parsed.document);
      const state = EditorState.create({ schema: before.type.schema, doc: before });
      const after = state.apply(state.tr.insertText("X", 1)).doc;
      const changed = proseMirrorToDocument(after, before);
      const output = projector.serialize(changed, source).markdown;
      if (source.includes("custom-inline")) expect(output).toContain("<custom-inline>inside</custom-inline>");
      else expect(output).toContain("[label][ref]");
    }
  });

  it("keeps extension identity and unsafe URLs inert in the visual model", () => {
    const callout = createDirectiveExtension({ name: "callout" });
    const extensionDocument = parseMarkdown(":::callout\nBody\n:::\n", { extensions: [commonmarkExtension, callout] }).document;
    const projected = documentToProseMirror(extensionDocument);
    expect(projected.firstChild?.type.name).toBe("extension_block");
    expect(projected.firstChild?.attrs.nodeType).toBe("directive-callout");
    expect(proseMirrorToDocument(projected, projected).content[0]).toMatchObject({ type: "directive-callout", text: "Body" });

    const unsafe = documentToProseMirror(parseMarkdown("[click](javascript:alert(1))\n").document);
    const link = unsafe.firstChild?.firstChild?.marks[0];
    expect(link?.attrs).toMatchObject({ blocked: true, href: "", sourceHref: "javascript:alert(1)" });
  });

  it("blocks unsafe link commands, inserts tables, and routes file drops to the host", async () => {
    const controller = createEditor({ markdown: "link", projector: createMarkdownProjector() });
    const target = document.createElement("div");
    document.body.append(target);
    const dropped: File[][] = [];
    const editor = createDomEditor({ target, controller, onFiles: (files) => { dropped.push([...files]); } });
    editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 1, 5)));
    expect(editor.setLink("java%0ascript:alert(1)")).toBe(false);
    expect(editor.setLink("https://example.com")).toBe(true);
    expect(editor.insertTable(2, 2)).toBe(true);
    const file = new File(["x"], "x.txt", { type: "text/plain" });
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
    target.querySelector(".ProseMirror")?.dispatchEvent(event);
    await Promise.resolve();
    expect(dropped).toEqual([[file]]);
    editor.destroy();
  });

  it("executes extension input rules and structured visual hooks in the DOM adapter", () => {
    const directive = createDirectiveExtension({ name: "note", label: "Note" });
    const rules = {
      name: "dom-rules",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" } as const,
      inputRules: [{ name: "arrow", match: /->/, replace: () => "→" }],
    };
    const extensions = [commonmarkExtension, directive, rules];
    const controller = createEditor({ markdown: ":::note\nBody\n:::\n\nText\n", projector: createMarkdownProjector({ extensions }), extensions });
    const target = document.createElement("div");
    const editor = createDomEditor({ target, controller });
    expect(target.querySelector('[data-md-directive="note"]')?.textContent).toContain("Body");
    let handled = false;
    editor.view.someProp("handleTextInput", (handler) => {
      handled = handler(editor.view, editor.view.state.doc.content.size - 1, editor.view.state.doc.content.size - 1, "->");
      return handled;
    });
    expect(handled).toBe(true);
    expect(controller.getState().markdown).toContain("→");
    editor.destroy();
  });

  it("passes canonical source offsets to visual input rules", () => {
    let observed: { readonly source: string; readonly from: number; readonly to: number } | undefined;
    const rules = {
      name: "source-position-rule",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" } as const,
      inputRules: [{
        name: "position",
        match: /x/,
        replace: (_match: RegExpMatchArray, input: { readonly source: string; readonly from: number; readonly to: number }) => {
          observed = input;
          return "X";
        },
      }],
    };
    const controller = createEditor({ markdown: "# Hello\n", projector: createMarkdownProjector({ extensions: [rules] }), extensions: [rules] });
    const target = document.createElement("div");
    const editor = createDomEditor({ target, controller });
    let handled = false;
    editor.view.someProp("handleTextInput", (handler) => {
      handled = handler(editor.view, 6, 6, "x");
      return handled;
    });

    expect(handled).toBe(true);
    expect(observed).toEqual({ text: "x", source: "# Hello\n", from: 7, to: 7 });
    expect(controller.getState().markdown).toBe("# HelloX\n");
    editor.destroy();
  });
});
