import { describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { createMdfnService } from "./index";

describe("mdfn server", () => {
  it("wraps the adapter and enforces optimistic versions", async () => {
    const database = memoryAdapter();
    const service = createMdfnService({ database, durability: "ephemeral", authorize: () => true, createId: (() => { let id = 0; return () => `id-${id++}`; })() });
    const principal = { id: "u" };
    const created = await service.create(principal, { markdown: "# One" });
    const updated = await service.update(principal, created.id, { expectedVersion: 1, markdown: "# Two" });
    expect(updated.version).toBe(2);
    await expect(service.update(principal, created.id, { expectedVersion: 1, markdown: "# Three" })).rejects.toMatchObject({ code: "MDFN_VERSION_CONFLICT" });
    expect(await service.versions(principal, created.id)).toHaveLength(2);
  });

  it("enforces tenant scope before host authorization and collaboration limits", async () => {
    const database = memoryAdapter();
    const service = createMdfnService({ database, durability: "ephemeral", authorize: () => true, maxCollaborationUpdateBytes: 4, createId: (() => { let id = 0; return () => `tenant-id-${id++}`; })() });
    const created = await service.create({ id: "a", tenantId: "tenant-a" }, { markdown: "# Scoped" });
    await expect(service.read({ id: "b", tenantId: "tenant-b" }, created.id)).rejects.toMatchObject({ code: "MDFN_DOCUMENT_NOT_FOUND" });
    await expect(service.appendCollaborationUpdate({ id: "a", tenantId: "tenant-a" }, created.id, "12345")).rejects.toMatchObject({ code: "MDFN_COLLAB_UPDATE_TOO_LARGE", status: 413 });
  });

  it("fails closed when durable storage lacks transaction support", () => {
    const database = memoryAdapter();
    database.capabilities.transactions = {
      ...database.capabilities.transactions,
      supported: false,
    };

    expect(() => createMdfnService({ database, authorize: () => true })).toThrowError("MDFN_TRANSACTIONAL_DATABASE_REQUIRED");
  });

  it("persists editorial workflows, restores revisions, and compacts collaboration state", async () => {
    const service = createMdfnService({ database: memoryAdapter(), durability: "ephemeral", authorize: () => true, createId: (() => { let id = 0; return () => `workflow-${id++}`; })() });
    const principal = { id: "author" };
    const created = await service.create(principal, { markdown: "# One" });
    const commented = await service.createComment(principal, created.id, { expectedVersion: 1, anchor: { from: 2, to: 5 }, body: "Please revise", idempotencyKey: "comment" });
    const threadId = commented.sidecar?.comments?.[0]?.id;
    expect(threadId).toBeTruthy();
    expect((await service.createComment(principal, created.id, { expectedVersion: 1, anchor: { from: 2, to: 5 }, body: "ignored replay", idempotencyKey: "comment" })).version).toBe(2);
    const replied = await service.replyComment(principal, created.id, threadId!, { expectedVersion: 2, body: "Working on it" });
    const resolved = await service.resolveComment(principal, created.id, threadId!, { expectedVersion: 3, resolved: true });
    const suggested = await service.createSuggestion(principal, created.id, { expectedVersion: 4, anchor: { from: 2, to: 5 }, replacement: "Two" });
    const suggestionId = suggested.sidecar?.suggestions?.[0]?.id;
    const accepted = await service.decideSuggestion(principal, created.id, suggestionId!, { expectedVersion: 5, decision: "accepted" });
    expect(accepted.markdown).toBe("# Two");
    const reviewing = await service.transitionReview(principal, created.id, { expectedVersion: 6, state: "in-review" });
    expect(reviewing.sidecar?.reviewState).toBe("in-review");
    expect(reviewing.sidecar?.audit).toHaveLength(6);
    await service.appendCollaborationUpdate(principal, created.id, "one");
    await service.appendCollaborationUpdate(principal, created.id, "two");
    const batch = await service.collaborationUpdates(principal, created.id);
    await service.compactCollaborationUpdates(principal, created.id, "snapshot", batch.includedUpdateIds);
    expect((await service.collaborationUpdates(principal, created.id)).updates).toEqual(["snapshot"]);
    const restored = await service.restoreVersion(principal, created.id, { version: 1, expectedVersion: 7 });
    expect(restored).toMatchObject({ markdown: "# One", version: 8 });
    expect(await service.versions(principal, created.id)).toHaveLength(8);
    await service.delete(principal, created.id);
    await expect(service.read(principal, created.id)).rejects.toMatchObject({ code: "MDFN_DOCUMENT_NOT_FOUND" });
    void replied;
    void resolved;
  });

  it("restores the complete historical title, Markdown, and sidecar snapshot", async () => {
    const service = createMdfnService({ database: memoryAdapter(), durability: "ephemeral", authorize: () => true, createId: (() => { let id = 0; return () => `restore-${id++}`; })() });
    const principal = { id: "author" };
    const created = await service.create(principal, { markdown: "historic" });
    const titled = await service.update(principal, created.id, { expectedVersion: 1, title: "Current title", markdown: "current" });
    const commented = await service.createComment(principal, created.id, { expectedVersion: titled.version, anchor: { from: 0, to: 7 }, body: "current comment" });

    const restored = await service.restoreVersion(principal, created.id, { version: 1, expectedVersion: commented.version });

    expect(restored).toMatchObject({ markdown: "historic", version: 4 });
    expect(restored.title).toBeUndefined();
    expect(restored.sidecar).toBeUndefined();
    expect((await service.version(principal, created.id, 4)).sidecar).toBeUndefined();
  });

  it("rejects untrusted sidecar structures before persistence", async () => {
    const service = createMdfnService({ database: memoryAdapter(), durability: "ephemeral", authorize: () => true });
    await expect(service.create({ id: "author" }, { markdown: "safe", sidecar: { comments: "invalid" } as never })).rejects.toMatchObject({ code: "MDFN_DOCUMENT_INVALID", status: 422 });
  });

  it("filters list results through document-level authorization", async () => {
    const service = createMdfnService({
      database: memoryAdapter(),
      durability: "ephemeral",
      authorize: (action, _principal, document) => action !== "read" || !document || document.title !== "restricted",
      createId: (() => { let id = 0; return () => `auth-${id++}`; })(),
    });
    const principal = { id: "owner" };
    await service.create(principal, { title: "visible", markdown: "visible" });
    const restricted = await service.create(principal, { title: "restricted", markdown: "secret" });
    await expect(service.read(principal, restricted.id)).rejects.toMatchObject({ code: "MDFN_FORBIDDEN" });
    expect((await service.list(principal)).map((document) => document.title)).toEqual(["visible"]);
  });

  it("keeps tenant documents out of owner-only listings", async () => {
    const service = createMdfnService({
      database: memoryAdapter(),
      durability: "ephemeral",
      authorize: () => true,
      createId: (() => { let id = 0; return () => `scope-${id++}`; })(),
    });
    await service.create({ id: "owner", tenantId: "tenant-a" }, { title: "tenant", markdown: "tenant" });
    await service.create({ id: "owner" }, { title: "personal", markdown: "personal" });
    expect((await service.list({ id: "owner" })).map((document) => document.title)).toEqual(["personal"]);
  });

  it("preserves collaboration updates appended after the compacted batch was read", async () => {
    const service = createMdfnService({
      database: memoryAdapter(),
      durability: "ephemeral",
      authorize: () => true,
      createId: (() => { let id = 0; return () => `race-${id++}`; })(),
    });
    const principal = { id: "author" };
    const document = await service.create(principal, { markdown: "body" });
    await service.appendCollaborationUpdate(principal, document.id, "included-one");
    await service.appendCollaborationUpdate(principal, document.id, "included-two");
    const batch = await service.collaborationUpdates(principal, document.id);
    await service.appendCollaborationUpdate(principal, document.id, "racing-update");
    await service.compactCollaborationUpdates(principal, document.id, "snapshot", batch.includedUpdateIds);
    const compacted = await service.collaborationUpdates(principal, document.id);
    expect(compacted.updates).toEqual(expect.arrayContaining(["racing-update", "snapshot"]));
    expect(compacted.updates).toHaveLength(2);
  });

  it("authorizes destructive collaboration compaction separately", async () => {
    const actions: string[] = [];
    const service = createMdfnService({
      database: memoryAdapter(),
      durability: "ephemeral",
      authorize: (action) => {
        actions.push(action);
        return action !== "compact-collaboration";
      },
      createId: (() => { let id = 0; return () => `compact-auth-${id++}`; })(),
    });
    const principal = { id: "editor" };
    const document = await service.create(principal, { markdown: "body" });
    await service.appendCollaborationUpdate(principal, document.id, "update");
    const batch = await service.collaborationUpdates(principal, document.id);

    await expect(service.compactCollaborationUpdates(principal, document.id, "snapshot", batch.includedUpdateIds))
      .rejects.toMatchObject({ code: "MDFN_FORBIDDEN", status: 403 });
    expect(actions).toContain("collaborate");
    expect(actions).toContain("compact-collaboration");
    expect((await service.collaborationUpdates(principal, document.id)).updates).toEqual(["update"]);
  });

  it("keeps editorial state and audit history server-authoritative", async () => {
    const service = createMdfnService({ database: memoryAdapter(), durability: "ephemeral", authorize: () => true, createId: (() => { let id = 0; return () => `integrity-${id++}`; })() });
    const principal = { id: "author" };
    const created = await service.create(principal, { markdown: "hello" });
    const commented = await service.createComment(principal, created.id, { expectedVersion: 1, anchor: { from: 0, to: 5 }, body: "review" });
    await expect(service.update(principal, created.id, { expectedVersion: commented.version, sidecar: { ...commented.sidecar, comments: [], audit: [] } }))
      .rejects.toMatchObject({ code: "MDFN_EDITORIAL_MUTATION_FORBIDDEN", status: 403 });
    const stored = await service.read(principal, created.id);
    expect(stored.sidecar?.comments).toHaveLength(1);
    expect(stored.sidecar?.audit).toHaveLength(1);
  });
});
