import { describe, afterAll } from "vitest";
import { IndexedDbAdapter } from "../../src/index";
import { runConformanceSuite } from "./shared";

let testCounter = 0;

describe("IndexedDbAdapter conformance", () => {
  runConformanceSuite({
    name: "indexeddb",
    create: () => new IndexedDbAdapter({ dbName: `conformance-idb-${++testCounter}` }),
    persistent: true,
  });
});
