import { describe } from "vitest";
import { IndexedDbAdapter } from "../../src/index";
import { runConformanceSuite } from "@searchfn/adapter-contracts/testing";

let testCounter = 0;

describe("IndexedDbAdapter conformance", () => {
  runConformanceSuite({
    name: "indexeddb",
    create: () => new IndexedDbAdapter({ dbName: `conformance-idb-${++testCounter}` }),
    persistent: true,
  });
});
