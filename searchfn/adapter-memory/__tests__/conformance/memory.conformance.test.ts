import { describe } from "vitest";
import { MemoryAdapter } from "../../src/index";
import { runConformanceSuite } from "./shared";

describe("MemoryAdapter conformance", () => {
  runConformanceSuite({
    name: "memory",
    create: () => new MemoryAdapter(),
    persistent: false,
  });
});
