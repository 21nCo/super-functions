import { describe, expect, it } from "vitest";
import { createMdfnClient } from "./index";

describe("client", () => {
  it("encodes document identifiers", async () => {
    let url = "";
    const client = createMdfnClient({ baseUrl: "https://example.test/api/mdfn", fetch: async (input) => {
      url = String(input);
      return Response.json({ id: "a/b", markdown: "", ownerId: "u", sourceHash: "h", schemaHash: "s", version: 1, createdAt: "", updatedAt: "" });
    } });
    await client.getDocument("a/b");
    expect(url.endsWith("/documents/a%2Fb")).toBe(true);
  });

  it("round-trips the exact update ids used to guard compaction", async () => {
    let compactBody: unknown;
    let readUrl = "";
    const client = createMdfnClient({ baseUrl: "https://example.test/api/mdfn", fetch: async (input, init) => {
      if (String(input).endsWith("/compact")) {
        compactBody = JSON.parse(String(init?.body));
        return Response.json({ id: "snapshot-id" });
      }
      readUrl = String(input);
      return Response.json({ updates: ["one", "two"], includedUpdateIds: ["update-1", "update-2"], nextCursor: "next/cursor" });
    } });
    const batch = await client.getCollaborationUpdates("document", { cursor: "current/cursor", limit: 2 });
    expect(batch.includedUpdateIds).toEqual(["update-1", "update-2"]);
    expect(batch.nextCursor).toBe("next/cursor");
    expect(new URL(readUrl).searchParams.get("cursor")).toBe("current/cursor");
    expect(new URL(readUrl).searchParams.get("limit")).toBe("2");
    expect(await client.compactCollaborationUpdates("document", "snapshot", batch.includedUpdateIds)).toBe("snapshot-id");
    expect(compactBody).toEqual({ snapshot: "snapshot", includedUpdateIds: ["update-1", "update-2"] });
  });

  it("exposes bounded lightweight version pages", async () => {
    let url = "";
    const client = createMdfnClient({ baseUrl: "https://example.test/api/mdfn", fetch: async (input) => {
      url = String(input);
      return Response.json({ versions: [{ id: "doc:2", documentId: "doc", version: 2 }], nextCursor: "2" });
    } });

    const page = await client.listVersions("doc", { cursor: "3", limit: 1 });

    expect(page.nextCursor).toBe("2");
    expect(page.versions[0]).not.toHaveProperty("markdown");
    expect(new URL(url).searchParams.get("cursor")).toBe("3");
    expect(new URL(url).searchParams.get("limit")).toBe("1");
  });
});
