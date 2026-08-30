import { describe, expect, it, vi } from "vitest";
import {
  Transaction,
  createEditor,
  createSnapshot,
  hashString,
  mapAnchor,
  resolveExtensions,
  restoreSnapshot,
  smallestSourceChange,
  type EditorProjector,
  type MdfnDocument,
  type MdfnExtension,
  createCommentThread,
  createSuggestion,
  decideSuggestion,
  transitionReview,
  validateMdfnSidecar,
} from "./index";

const projector: EditorProjector = {
  parse(markdown) {
    return {
      document: { type: "doc", schemaVersion: 1, content: [{ type: "text", text: markdown }] },
      diagnostics: [],
      sourceHash: hashString(markdown),
    };
  },
  serialize(document) {
    return {
      markdown: document.content.map((node) => node.text ?? "").join(""),
      diagnostics: [],
      preservation: { exactUntouched: false, semanticSupported: true, opaqueUnsupported: true, touchedRegionOnly: false },
    };
  },
};

describe("@mdfn/core", () => {
  it("applies source transactions, maps anchors, and supports history", () => {
    const editor = createEditor({ markdown: "hello world", projector });
    const listener = vi.fn();
    editor.subscribe(listener);
    editor.dispatch(new Transaction().replaceSource(6, 11, "mdfn").withSource("test"));
    expect(editor.getState().markdown).toBe("hello mdfn");
    expect(listener).toHaveBeenCalledOnce();
    expect(editor.undo()).toBe(true);
    expect(editor.getState().markdown).toBe("hello world");
    expect(editor.redo()).toBe(true);
    expect(editor.getState().markdown).toBe("hello mdfn");
    expect(mapAnchor({ from: 8, to: 11 }, [{ from: 6, to: 11, insertedLength: 4 }])).toEqual({ from: 10, to: 10 });
  });

  it("publishes the minimal changed range when restoring history", () => {
    const editor = createEditor({ markdown: "before after", projector });
    const listener = vi.fn();
    editor.subscribe(listener);
    editor.dispatch(new Transaction().replaceSource(12, 12, "!"));
    listener.mockClear();
    expect(editor.undo()).toBe(true);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      changedRanges: [{ from: 12, to: 13, insertedLength: 0 }],
      documentChanged: true,
    }));
  });

  it("maps canonical selections through source replacement", () => {
    const editor = createEditor({
      markdown: "hello world",
      projector,
      selection: { kind: "text", anchor: 8, head: 8 },
    });
    const replacement = "a completely different document";
    const change = editor.dispatch(new Transaction().replaceSource(0, 11, replacement));
    expect(change.selectionChanged).toBe(true);
    expect(editor.getState().selection).toEqual({ kind: "text", anchor: replacement.length, head: replacement.length });

    editor.dispatch(new Transaction().replaceSource(0, 0, "prefix "));
    expect(editor.getState().selection).toEqual({ kind: "text", anchor: replacement.length + 7, head: replacement.length + 7 });
  });

  it("maps sidecar anchors through structural document replacement", () => {
    let id = 0;
    const comment = createCommentThread({
      anchor: { from: 6, to: 11 },
      body: "Track this",
      actor: { id: "author", now: () => "2026-08-13T00:00:00.000Z", createId: () => `anchor-${++id}` },
      markdownLength: 11,
    });
    const editor = createEditor({ markdown: "hello world", projector, sidecar: comment.sidecar });
    editor.dispatch(new Transaction().replaceDocument(projector.parse("prefix hello world").document));
    expect(editor.getState().sidecar?.comments?.[0]?.anchor).toEqual({ from: 13, to: 18 });
  });

  it("reparses serialized documents before retaining source spans", () => {
    const editor = createEditor({ markdown: "abc", projector });
    const edited = { ...projector.parse("abcd").document, source: { from: 0, to: 3, raw: "abc", dirty: true } } as MdfnDocument;
    editor.dispatch(new Transaction().replaceDocument(edited));
    expect(editor.getState().document).toEqual(projector.parse("abcd").document);
  });

  it("clears node selections when source edits can invalidate node identity", () => {
    const editor = createEditor({ markdown: "hello", projector, selection: { kind: "node", nodeId: "paragraph-1" } });
    const change = editor.dispatch(new Transaction().replaceSource(5, 5, " world"));
    expect(change.selectionChanged).toBe(true);
    expect(editor.getState().selection).toBeNull();
  });

  it("validates extension dependencies, conflicts, and deterministic schema identity", () => {
    const base = {
      name: "base",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "touched-region", unsupported: "opaque" } as const,
    };
    const registry = resolveExtensions([
      { ...base, name: "tables", dependencies: ["base"] },
      base,
    ]);
    expect(registry.extensions.map((entry) => entry.name)).toEqual(["base", "tables"]);
    expect(registry.schemaHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => resolveExtensions([{ ...base, dependencies: ["missing"] }])).toThrowError(/requires missing/);
    expect(() => resolveExtensions([base, { ...base, name: "unsafe", conflicts: ["base"] }])).toThrowError(/conflicts/);
  });

  it("rejects non-adjacent migrations and applies every migration in a schema transition", () => {
    const preservation = { noEdit: "exact", edited: "semantic", unsupported: "opaque" } as const;
    try {
      resolveExtensions([{ name: "invalid", version: "1", preservation, migrations: [{ from: 1, to: 1, migrate: (document) => document }] }]);
      throw new Error("expected invalid migration to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "MDFN_EXTENSION_MIGRATION_INVALID" });
    }
    const registry = resolveExtensions([
      { name: "first", version: "1", preservation, migrations: [{ from: 1, to: 2, migrate: (document) => ({ ...document, content: [...document.content, { type: "text", text: "first" }] }) }] },
      { name: "second", version: "1", preservation, migrations: [{ from: 1, to: 2, migrate: (document) => ({ ...document, content: [...document.content, { type: "text", text: "second" }] }) }] },
    ]);
    const migrated = registry.migrate({ type: "doc", schemaVersion: 1, content: [] }, 1, 2);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.content.map((node) => node.text)).toEqual(["first", "second"]);
  });

  it("resolves executable extension keymaps, text rules, and plugin cleanup", () => {
    let setup = 0;
    let cleanup = 0;
    const command = () => true;
    const extension: MdfnExtension = {
      name: "lifecycle",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" } as const,
      commands: { insert: command },
      keymap: { "Mod-Alt-l": "insert" },
      inputRules: [{ name: "arrow", match: /->/, replace: () => "→" }],
      pasteRules: [{ name: "ellipsis", match: /\.\.\./, replace: () => "…" }],
      plugins: [{ name: "observe", setup: () => { setup += 1; return () => { cleanup += 1; }; } }],
    };
    const registry = resolveExtensions([extension]);
    expect(registry.keymap["Mod-Alt-l"]).toBe("lifecycle:insert");
    expect(registry.inputRules).toHaveLength(1);
    const editor = createEditor({ markdown: "", projector, extensions: [extension] });
    expect(setup).toBe(1);
    editor.destroy();
    expect(cleanup).toBe(1);
    expect(() => resolveExtensions([extension, { ...extension, name: "other" }])).toThrowError(/Duplicate key binding/);
  });

  it("checks dispatching commands without mutating editor state", () => {
    const extension = {
      name: "dispatching-command",
      version: "1.0.0",
      preservation: { noEdit: "exact", edited: "semantic", unsupported: "opaque" } as const,
      commands: {
        append: ({ state, dispatch }) => {
          dispatch(new Transaction().replaceSource(state.markdown.length, state.markdown.length, "!"));
          return true;
        },
      },
    };
    const editor = createEditor({ markdown: "safe", projector, extensions: [extension] });
    expect(editor.can("dispatching-command:append")).toBe(true);
    expect(editor.getState().markdown).toBe("safe");
    expect(editor.run("dispatching-command:append")).toBe(true);
    expect(editor.getState().markdown).toBe("safe!");
  });

  it("invalidates cached documents when source or schema identity changes", () => {
    const editor = createEditor({ markdown: "source", projector });
    const snapshot = createSnapshot(editor.getState());
    expect(restoreSnapshot(snapshot, projector, editor.extensions.schemaHash).markdown).toBe("source");
    expect(() => restoreSnapshot({ ...snapshot, markdown: "changed" }, projector, editor.extensions.schemaHash)).toThrowError(
      "MDFN_SNAPSHOT_SOURCE_HASH_MISMATCH",
    );
    const restored = restoreSnapshot(snapshot, projector, "different");
    expect(restored.document).toEqual(projector.parse("source").document as MdfnDocument);
    const forged = {
      ...snapshot,
      document: { type: "doc", schemaVersion: 1, content: [{ type: "text", text: "forged" }] } as MdfnDocument,
    };
    expect(restoreSnapshot(forged, projector, editor.extensions.schemaHash).document).toEqual(projector.parse("source").document);
  });

  it("publishes saved-state changes without adding history", () => {
    const editor = createEditor({ markdown: "before", projector });
    editor.dispatch(new Transaction().replaceSource(0, 6, "after"));
    const listener = vi.fn();
    editor.subscribe(listener);
    editor.markSaved();
    expect(editor.getState()).toMatchObject({ markdown: "after", dirty: false, version: 2 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ source: "state:saved", documentChanged: false }));
    expect(editor.undo()).toBe(true);
    expect(editor.getState().markdown).toBe("before");
  });

  it("derives restored dirty state from the current saved revision", () => {
    const editor = createEditor({ markdown: "one", projector });
    editor.dispatch(new Transaction().replaceSource(0, 3, "two"));
    editor.markSaved();
    expect(editor.undo()).toBe(true);
    expect(editor.getState()).toMatchObject({ markdown: "one", dirty: true });
    expect(editor.redo()).toBe(true);
    expect(editor.getState()).toMatchObject({ markdown: "two", dirty: false });
  });

  it("uses SHA-256 source identity", () => {
    expect(hashString("abc")).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("maps auditable comments and accepted suggestions through canonical transactions", () => {
    let id = 0;
    const actor = { id: "author", now: () => "2026-08-12T00:00:00.000Z", createId: () => `id-${++id}` };
    const comment = createCommentThread({ anchor: { from: 0, to: 5 }, body: "Review", actor, markdownLength: 11 });
    const suggestion = createSuggestion({ sidecar: comment.sidecar, anchor: { from: 6, to: 11 }, replacement: "mdfn", actor, markdownLength: 11 });
    const editor = createEditor({ markdown: "hello world", projector, sidecar: suggestion.sidecar });
    decideSuggestion({ controller: editor, suggestionId: suggestion.suggestion.id, decision: "accepted", actor });
    expect(editor.getState().markdown).toBe("hello mdfn");
    expect(editor.getState().sidecar?.suggestions?.[0]).toMatchObject({ status: "accepted", anchor: { from: 10, to: 10 } });
    expect(editor.getState().sidecar?.audit?.at(-1)?.action).toBe("suggestion-accepted");
    expect(transitionReview({ sidecar: editor.getState().sidecar, to: "in-review", actor }).reviewState).toBe("in-review");
  });

  it("rejects malformed, duplicate, oversized, and out-of-range sidecar data", () => {
    expect(() => validateMdfnSidecar({ comments: "invalid" })).toThrowError("MDFN_SIDECAR_COMMENTS_INVALID");
    expect(() => validateMdfnSidecar({ suggestions: [{ id: "s", anchor: { from: 0, to: 99 }, replacement: "", authorId: "a", status: "pending", createdAt: "2026-08-12T00:00:00.000Z" }] }, { markdownLength: 2 })).toThrowError("MDFN_SIDECAR_ANCHOR_INVALID");
    expect(() => validateMdfnSidecar({ assets: [{ id: "same", mediaType: "text/plain" }, { id: "same", mediaType: "text/plain" }] })).toThrowError("MDFN_SIDECAR_DUPLICATE_ID:same");
    expect(() => validateMdfnSidecar({ comments: [{ id: "thread", anchor: { from: 0, to: 0 }, resolved: false, messages: [
      { id: "one", authorId: "a", body: "one", createdAt: "2026-08-12T00:00:00.000Z" },
      { id: "two", authorId: "a", body: "two", createdAt: "2026-08-12T00:00:00.000Z" },
    ] }] }, { maxEntries: 2 })).toThrowError("MDFN_SIDECAR_ENTRY_LIMIT_EXCEEDED");
    expect(() => validateMdfnSidecar({ assets: [{ id: "asset", mediaType: "text/plain", metadata: { nested: "x".repeat(33) } }] }, { maxTextLength: 32 })).toThrowError("MDFN_SIDECAR_ASSET_INVALID");
    expect(() => validateMdfnSidecar({ assets: [{ id: "asset", mediaType: "text/plain", metadata: { values: [1, 2, 3] } }] }, { maxEntries: 4 })).toThrowError("MDFN_SIDECAR_ENTRY_LIMIT_EXCEEDED");
    expect(() => validateMdfnSidecar({ comments: [
      { id: "one", anchor: { from: 0, to: 0 }, resolved: false, messages: [{ id: "m1", authorId: "a", body: "123456", createdAt: "2026-08-12T00:00:00.000Z" }] },
      { id: "two", anchor: { from: 0, to: 0 }, resolved: false, messages: [{ id: "m2", authorId: "a", body: "789012", createdAt: "2026-08-12T00:00:00.000Z" }] },
    ] }, { maxTextLength: 8, maxAggregateTextLength: 10 })).toThrowError("MDFN_SIDECAR_TEXT_LIMIT_EXCEEDED");
    expect(() => validateMdfnSidecar({ extra: "x".repeat(1_000_000) })).toThrowError("MDFN_SIDECAR_INVALID");
    expect(() => validateMdfnSidecar({ assets: [{ id: "asset", mediaType: "text/plain", extra: "unbounded" }] })).toThrowError("MDFN_SIDECAR_ASSET_INVALID");
  });

  it("reports sidecar changes caused by source anchor mapping", () => {
    const sidecar = {
      comments: [{ id: "thread", anchor: { from: 1, to: 2 }, resolved: false, messages: [{ id: "message", authorId: "a", body: "note", createdAt: "2026-08-12T00:00:00.000Z" }] }],
    } as const;
    const editor = createEditor({ markdown: "abc", projector, sidecar });
    const change = editor.dispatch(new Transaction().replaceSource(0, 0, "x"));
    expect(change.sidecarChanged).toBe(true);
    expect(editor.getState().sidecar?.comments?.[0]?.anchor).toEqual({ from: 2, to: 3 });
  });

  it("keeps unchanged anchors stable when a textarea edit is reduced to its smallest source range", () => {
    const sidecar = {
      comments: [{ id: "thread", anchor: { from: 1, to: 2 }, resolved: false, messages: [{ id: "message", authorId: "a", body: "note", createdAt: "2026-08-12T00:00:00.000Z" }] }],
    } as const;
    const editor = createEditor({ markdown: "abc", projector, sidecar });
    const change = smallestSourceChange("abc", "abcd");
    expect(change).toEqual({ from: 3, to: 3, insert: "d" });
    editor.dispatch(new Transaction().replaceSource(change!.from, change!.to, change!.insert));
    expect(editor.getState().sidecar?.comments?.[0]?.anchor).toEqual({ from: 1, to: 2 });
  });
});
