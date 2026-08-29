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
    const client = createMdfnClient({ baseUrl: "https://example.test/api/mdfn", fetch: async (input, init) => {
      if (String(input).endsWith("/compact")) {
        compactBody = JSON.parse(String(init?.body));
        return Response.json({ id: "snapshot-id" });
      }
      return Response.json({ updates: ["one", "two"], includedUpdateIds: ["update-1", "update-2"] });
    } });
    const batch = await client.getCollaborationUpdates("document");
    expect(batch.includedUpdateIds).toEqual(["update-1", "update-2"]);
    expect(await client.compactCollaborationUpdates("document", "snapshot", batch.includedUpdateIds)).toBe("snapshot-id");
    expect(compactBody).toEqual({ snapshot: "snapshot", includedUpdateIds: ["update-1", "update-2"] });
  });
});
