import { describe, expect, it } from "vitest";
import { createEditor } from "@mdfn/core";
import { createAdapterBridge, compareAdapterTraces, recordSemanticTrace } from "./index";

const projector = {
  parse: (markdown: string) => ({ document: { type: "doc" as const, schemaVersion: 1, content: [{ type: "paragraph", content: [{ type: "text", text: markdown }] }] }, diagnostics: [] }),
  serialize: (document: { content: readonly { content?: readonly { text?: string }[] }[] }) => ({ markdown: document.content.flatMap((node) => node.content ?? []).map((node) => node.text ?? "").join(""), diagnostics: [], preservation: { exactUntouched: false, semanticSupported: true, opaqueUnsupported: true, touchedRegionOnly: false } }),
};

describe("@mdfn/adapter-kit", () => {
  it("binds lifecycle without owning editor semantics", () => {
    const controller = createEditor({ markdown: "a", projector });
    const bridge = createAdapterBridge(controller);
    bridge.replaceSource("b");
    expect(bridge.getSnapshot().markdown).toBe("b");
    let notifications = 0;
    const unsubscribe = bridge.subscribe(() => { notifications += 1; });
    bridge.markSaved();
    expect(bridge.getSnapshot().dirty).toBe(false);
    expect(notifications).toBe(1);
    unsubscribe();
    bridge.destroy();
    expect(() => bridge.getSnapshot()).toThrowError("MDFN_ADAPTER_BRIDGE_DESTROYED");
  });

  it("compares normalized semantic traces", () => {
    const reference = recordSemanticTrace("vanilla", "replace", createEditor({ markdown: "a", projector }), (controller) => createAdapterBridge(controller).replaceSource("b"));
    const react = recordSemanticTrace("react", "replace", createEditor({ markdown: "a", projector }), (controller) => {
      const bridge = createAdapterBridge(controller);
      bridge.replaceSource("b");
      bridge.destroy();
    });
    expect(compareAdapterTraces(reference, [react])).toEqual([]);
    expect(compareAdapterTraces(reference, [{ ...react, vectorId: "different" }])).toEqual(["react"]);
  });
});
