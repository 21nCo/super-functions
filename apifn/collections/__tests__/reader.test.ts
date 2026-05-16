import path from "node:path";
import { readCollection } from "../src/reader.js";

describe("readCollection", () => {
  it("TV-COLL-001: reads OpenCollection fixture with folders, requests, and environments", async () => {
    const fixture = path.resolve(
      __dirname,
      "fixtures/test-collection"
    );

    const collection = await readCollection(fixture);

    expect(collection.info.name).toBe("Test Collection");
    expect(collection.environments.development).toEqual({
      name: "development",
      variables: {
        baseUrl: "http://localhost:3000",
        apiVersion: "v1",
      },
    });

    expect(collection.items[0]?.kind).toBe("folder");
    expect(collection.items[0]?.name).toBe("Users");
    expect(collection.items[0]?.children?.map((x) => x.name)).toEqual([
      "List Users",
      "Create User",
    ]);

    expect(collection.items[1]?.name).toBe("Admin");
    expect(collection.items[1]?.children?.[0]?.name).toBe("Audits");
    expect(collection.items[1]?.children?.[0]?.children?.[0]?.name).toBe("List Audits");
  });

  it("COLL-001 NEG: missing opencollection.yml throws descriptive error", async () => {
    const missing = path.resolve(__dirname, "fixtures/does-not-exist");
    await expect(readCollection(missing)).rejects.toThrow(
      /No opencollection\.yml found/i
    );
  });

  it("TV-COLL-006: reads Bruno-compatible fixture", async () => {
    const fixture = path.resolve(__dirname, "fixtures/bruno-collection");
    const collection = await readCollection(fixture);

    expect(collection.info.name).toBe("Bruno Sample");
    expect(collection.items[0]?.name).toBe("Users");
    expect(collection.items[0]?.children?.[0]?.request?.http.method).toBe("GET");
  });
});
