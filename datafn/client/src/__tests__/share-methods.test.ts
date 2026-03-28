import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createDatafnClient } from "../client.js";
import { DefaultHttpTransport } from "../transport/http.js";

const schema: any = {
  resources: [
    {
      name: "docs",
      version: 1,
      idPrefix: "doc:",
      capabilities: [
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "logs",
      version: 1,
      idPrefix: "log:",
      fields: [{ name: "message", type: "string" as const, required: true }],
    },
  ],
  relations: [],
};

describe("Client share methods", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes share/unshare/getPermissions only for shareable resources", () => {
    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    expect(typeof client.docs.share).toBe("function");
    expect(typeof client.docs.unshare).toBe("function");
    expect(typeof client.docs.getPermissions).toBe("function");

    expect(client.logs.share).toBeUndefined();
    expect(client.logs.unshare).toBeUndefined();
    expect(client.logs.getPermissions).toBeUndefined();
  });

  it("share() sends share mutation payload", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: ["doc:1"], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.docs.share!("doc:1", "user:alice", "editor");

    expect(mutationSpy).toHaveBeenCalledWith({
      resource: "docs",
      version: 1,
      operation: "share",
      id: "doc:1",
      shareWith: { userId: "user:alice", level: "editor" },
    });
  });

  it("unshare() sends unshare mutation payload", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: ["doc:1"], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.docs.unshare!("doc:1", "user:alice");

    expect(mutationSpy).toHaveBeenCalledWith({
      resource: "docs",
      version: 1,
      operation: "unshare",
      id: "doc:1",
      shareWith: { userId: "user:alice" },
    });
  });

  it("share() supports principal overload for record scope", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: ["doc:1"], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.docs.share!({
      id: "doc:1",
      principalId: "team:engineering",
      level: "viewer",
    });

    expect(mutationSpy).toHaveBeenCalledWith({
      resource: "docs",
      version: 1,
      operation: "share",
      id: "doc:1",
      scope: "record",
      shareWith: { principalId: "team:engineering", level: "viewer" },
    });
  });

  it("share() supports resource scope grants", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: [], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.docs.share!({
      scope: "resource",
      principalId: "user:partner",
      level: "viewer",
    });

    expect(mutationSpy).toHaveBeenCalledWith({
      resource: "docs",
      version: 1,
      operation: "share",
      scope: "resource",
      shareWith: { principalId: "user:partner", level: "viewer" },
    });
  });

  it("unshare() supports principal overload for resource scope", async () => {
    const mutationSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "mutation")
      .mockResolvedValue({
        ok: true,
        result: { ok: true, mutationId: "m", affectedIds: [], deduped: false },
      });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await client.docs.unshare!({
      scope: "resource",
      principalId: "user:partner",
    });

    expect(mutationSpy).toHaveBeenCalledWith({
      resource: "docs",
      version: 1,
      operation: "unshare",
      scope: "resource",
      shareWith: { principalId: "user:partner" },
    });
  });

  it("share() rejects invalid record scope argument combinations", async () => {
    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    await expect(
      client.docs.share!({
        scope: "record",
        principalId: "user:alice",
        level: "viewer",
      }),
    ).rejects.toMatchObject({
      code: "DFQL_SHARE_SCOPE_INVALID",
      details: { path: "id" },
    });
  });

  it("getPermissions() returns permission entries", async () => {
    const querySpy = vi.spyOn(DefaultHttpTransport.prototype, "query").mockResolvedValue({
      ok: true,
      result: [
        {
          userId: "user:alice",
          level: "editor",
          grantedBy: "user:bob",
          grantedAt: 123,
        },
      ],
    });

    const client = createDatafnClient({
      schema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
    });

    const entries = await client.docs.getPermissions!("doc:1");

    expect(querySpy).toHaveBeenCalledWith({
      resource: "docs",
      version: 1,
      operation: "getPermissions",
      id: "doc:1",
    });
    expect(entries).toEqual([
      {
        userId: "user:alice",
        level: "editor",
        grantedBy: "user:bob",
        grantedAt: 123,
      },
    ]);
  });
});
