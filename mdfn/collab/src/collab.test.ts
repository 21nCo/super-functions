import { describe, expect, it } from "vitest";
import { createEditor, Transaction } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { createCollaborationSession, Y } from "./index";

describe("collaboration", () => {
  it("exchanges offline updates and projects them through the controller", async () => {
    const projector = createMarkdownProjector();
    const a = createEditor({ markdown: "one", projector });
    const sessionA = createCollaborationSession({ controller: a, documentId: "d", user: { id: "a" } });
    const remoteDoc = new Y.Doc();
    Y.applyUpdate(remoteDoc, sessionA.encodeUpdate());
    const b = createEditor({ markdown: "stale", projector });
    const sessionB = createCollaborationSession({ controller: b, documentId: "d", user: { id: "b" }, doc: remoteDoc });
    a.dispatch(new Transaction().replaceSource(0, 3, "two").withSource("test"));
    await sessionB.applyUpdate(sessionA.encodeUpdate(sessionB.encodeStateVector()));
    expect(b.getState().markdown).toBe("two");
    sessionA.destroy(); sessionB.destroy();
  });

  it("projects initialized shared Markdown and sidecar without adding local history", () => {
    const projector = createMarkdownProjector();
    const shared = createEditor({
      markdown: "shared",
      projector,
      sidecar: { assets: [{ id: "asset", mediaType: "image/png" }] },
    });
    const owner = createCollaborationSession({ controller: shared, documentId: "initial", user: { id: "owner" } });
    const joining = createEditor({ markdown: "stale", projector });
    const joined = createCollaborationSession({ controller: joining, documentId: "initial", user: { id: "joining" }, doc: owner.doc });
    expect(joining.getState()).toMatchObject({ markdown: "shared", sidecar: { assets: [{ id: "asset" }] } });
    expect(joining.canUndo()).toBe(false);
    joined.destroy(); owner.destroy(); joining.destroy(); shared.destroy();
  });

  it("keeps an initialized empty shared document canonical", () => {
    const projector = createMarkdownProjector();
    const empty = createEditor({ markdown: "", projector });
    const owner = createCollaborationSession({ controller: empty, documentId: "empty", user: { id: "owner" } });
    const joining = createEditor({ markdown: "must not win", projector });
    const joined = createCollaborationSession({ controller: joining, documentId: "empty", user: { id: "joining" }, doc: owner.doc });
    expect(joining.getState().markdown).toBe("");
    expect(owner.doc.getText("markdown").toString()).toBe("");
    joined.destroy(); owner.destroy(); joining.destroy(); empty.destroy();
  });

  it("queues offline edits, compacts them, reconnects, and converges", async () => {
    const left = createEditor({ markdown: "one", projector: createMarkdownProjector() });
    const right = createEditor({ markdown: "stale", projector: createMarkdownProjector() });
    let rightSession: ReturnType<typeof createCollaborationSession>;
    const events: string[] = [];
    const leftSession = createCollaborationSession({
      controller: left,
      documentId: "offline",
      user: { id: "left" },
      online: false,
      compactionThresholdBytes: 1,
      onAudit: (event) => events.push(event.type),
      sendUpdate: (update) => rightSession.applyUpdate(update, "left"),
    });
    const rightDoc = new Y.Doc();
    Y.applyUpdate(rightDoc, leftSession.encodeUpdate());
    rightSession = createCollaborationSession({
      controller: right,
      documentId: "offline",
      user: { id: "right" },
      doc: rightDoc,
    });
    left.dispatch(new Transaction().replaceSource(0, 3, "offline edit").withSource("test"));
    expect(leftSession.pendingUpdateCount()).toBe(1);
    expect(right.getState().markdown).toBe("one");
    await leftSession.setOnline(true);
    expect(right.getState().markdown).toBe("offline edit");
    expect(leftSession.pendingUpdateCount()).toBe(0);
    expect(events).toEqual(expect.arrayContaining(["local-update", "compact", "online", "flush"]));
    leftSession.destroy();
    rightSession.destroy();
  });

  it("sends a dependency-complete initial state before incremental edits", async () => {
    const controller = createEditor({ markdown: "initial", projector: createMarkdownProjector() });
    const sent: Uint8Array[] = [];
    const session = createCollaborationSession({ controller, documentId: "bootstrap", user: { id: "author" }, sendUpdate: (update) => { sent.push(update); } });
    await session.flush();
    expect(sent).toHaveLength(1);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, sent[0]);
    expect(peer.getText("markdown").toString()).toBe("initial");
    expect(peer.getMap("metadata").get("documentId")).toBe("bootstrap");
    session.destroy(); controller.destroy(); peer.destroy();
  });

  it("preserves a replacement snapshot when compaction races an in-flight send", async () => {
    const controller = createEditor({ markdown: "a", projector: createMarkdownProjector() });
    let release!: () => void;
    let started!: () => void;
    const firstStarted = new Promise<void>((resolve) => { started = resolve; });
    const sent: Uint8Array[] = [];
    const session = createCollaborationSession({
      controller,
      documentId: "race",
      user: { id: "author" },
      compactionThresholdBytes: 1,
      sendUpdate: async (update) => {
        sent.push(update);
        if (sent.length === 1) { started(); await new Promise<void>((resolve) => { release = resolve; }); }
      },
    });
    await firstStarted;
    controller.dispatch(new Transaction().replaceSource(1, 1, "1"));
    controller.dispatch(new Transaction().replaceSource(2, 2, "2"));
    release();
    await session.flush();
    expect(sent).toHaveLength(2);
    expect(session.pendingUpdateCount()).toBe(0);
    const peer = new Y.Doc();
    Y.applyUpdate(peer, sent[0]);
    Y.applyUpdate(peer, sent[1]);
    expect(peer.getText("markdown").toString()).toBe("a12");
    session.destroy(); controller.destroy(); peer.destroy();
  });

  it("rejects incompatible schema metadata before mutating the live document", async () => {
    const projector = createMarkdownProjector();
    const controller = createEditor({ markdown: "safe", projector });
    const session = createCollaborationSession({ controller, documentId: "d", user: { id: "a" } });
    const baseline = session.encodeStateVector();
    const peer = new Y.Doc();
    Y.applyUpdate(peer, session.encodeUpdate());
    peer.getMap("metadata").set("schemaHash", "incompatible");
    await expect(session.applyUpdate(Y.encodeStateAsUpdate(peer, baseline), "peer")).rejects.toThrowError(/MDFN_COLLAB_SCHEMA_MISMATCH/);
    expect(session.doc.getMap("metadata").get("schemaHash")).toBe(controller.getState().schemaHash);
    session.destroy(); controller.destroy(); peer.destroy();
  });

  it("validates candidate Markdown before mutating the live Y document", async () => {
    const controller = createEditor({ markdown: "safe", projector: createMarkdownProjector({ maxBytes: 4 }) });
    const session = createCollaborationSession({ controller, documentId: "limits", user: { id: "owner" } });
    const baseline = session.encodeStateVector();
    const peer = new Y.Doc();
    Y.applyUpdate(peer, session.encodeUpdate());
    peer.getText("markdown").insert(4, "!");
    await expect(session.applyUpdate(Y.encodeStateAsUpdate(peer, baseline), "peer")).rejects.toThrowError(/MDFN_COLLAB_MARKDOWN_INVALID/);
    expect(session.doc.getText("markdown").toString()).toBe("safe");
    session.destroy(); controller.destroy(); peer.destroy();
  });

  it("rejects malformed sidecars, unauthorized updates, and oversized payloads", async () => {
    const projector = createMarkdownProjector();
    const controller = createEditor({ markdown: "safe", projector });
    const session = createCollaborationSession({ controller, documentId: "d", user: { id: "a" }, maxUpdateBytes: 4096, authorizeUpdate: (_update, origin) => origin !== "forbidden" });
    const peer = new Y.Doc();
    Y.applyUpdate(peer, session.encodeUpdate());
    const baseline = session.encodeStateVector();
    peer.getMap("sidecar").set("value", JSON.stringify({ comments: "invalid" }));
    const update = Y.encodeStateAsUpdate(peer, baseline);
    await expect(session.applyUpdate(update, "peer")).rejects.toThrowError(/MDFN_COLLAB_SIDECAR_INVALID/);
    await expect(session.applyUpdate(update, "forbidden")).rejects.toThrowError("MDFN_COLLAB_UPDATE_FORBIDDEN");
    await expect(session.applyUpdate(new Uint8Array(4097), "peer")).rejects.toThrowError(/MDFN_COLLAB_UPDATE_TOO_LARGE/);
    session.destroy(); controller.destroy(); peer.destroy();
  });

  it("rejects malformed sidecars already present in a supplied document", () => {
    const projector = createMarkdownProjector();
    const ownerController = createEditor({ markdown: "safe", projector });
    const owner = createCollaborationSession({ controller: ownerController, documentId: "malformed", user: { id: "owner" } });
    const doc = owner.doc;
    owner.destroy();
    doc.getMap("sidecar").set("value", JSON.stringify({ comments: "invalid" }));
    const joining = createEditor({ markdown: "stale", projector });
    expect(() => createCollaborationSession({ controller: joining, documentId: "malformed", user: { id: "joining" }, doc }))
      .toThrowError(/MDFN_COLLAB_SIDECAR_INVALID/);
    joining.destroy(); ownerController.destroy(); doc.destroy();
  });

  it("keeps remote collaboration updates out of local undo history", async () => {
    const projector = createMarkdownProjector();
    const left = createEditor({ markdown: "one", projector });
    const leftSession = createCollaborationSession({ controller: left, documentId: "history", user: { id: "left" } });
    const rightDoc = new Y.Doc();
    Y.applyUpdate(rightDoc, leftSession.encodeUpdate());
    const right = createEditor({ markdown: "stale", projector });
    const rightSession = createCollaborationSession({ controller: right, documentId: "history", user: { id: "right" }, doc: rightDoc });
    left.dispatch(new Transaction().replaceSource(0, 3, "two"));
    await rightSession.applyUpdate(leftSession.encodeUpdate(rightSession.encodeStateVector()), "left");
    expect(right.getState().markdown).toBe("two");
    expect(right.canUndo()).toBe(false);
    rightSession.destroy(); leftSession.destroy(); right.destroy(); left.destroy(); rightDoc.destroy();
  });
});
