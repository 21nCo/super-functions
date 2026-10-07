import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

// Keep runtime compatibility independent of Vitest's development-tool engine.
for (const format of ["esm", "cjs"]) {
  test(`built ${format} client indexes, searches, removes and clears on the minimum runtime`, async () => {
    const { createMemorySearchClient } = format === "esm"
      ? await import("@searchfn/client")
      : require("@searchfn/client");
    const client = createMemorySearchClient();
    try {
      await client.initialize({ resources: [{ name: "tasks", searchFields: ["title"] }] });
      await client.index({
        resource: "tasks",
        documents: [
          { id: "first", fields: { title: "buy groceries" } },
          { id: "second", fields: { title: "buy phone" } },
        ],
      });
      assert.deepEqual(new Set(await client.search({ resource: "tasks", query: "buy" })), new Set(["first", "second"]));
      await client.remove({ resource: "tasks", ids: ["first"] });
      assert.deepEqual(await client.search({ resource: "tasks", query: "buy" }), ["second"]);
      await assert.rejects(client.search({ resource: "tasks", query: " " }), /query must not be empty/i);
      await client.clear("tasks");
      assert.deepEqual(await client.search({ resource: "tasks", query: "buy" }), []);
    } finally {
      await client.dispose();
    }
  });
}
