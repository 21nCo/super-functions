import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readReceipt, writeReceipt } from "../src/index.js";
import type { LifecycleReceipt } from "../src/types.js";

describe("runtime receipts", () => {
  it("keeps a running receipt discoverable after runtimeDir changes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-runtime-"));
    const receipt: LifecycleReceipt = {
      version: 1,
      projectId: "app",
      instanceId: "instance",
      invocationId: "invocation",
      profile: "default",
      state: "ready",
      root,
      runtimeDir: path.join(root, "old-runtime", "instances", "instance"),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allocations: [],
      processes: [],
      services: [],
      routes: [],
      urls: {},
      environmentOutputs: [],
    };
    await writeReceipt(receipt);
    const changed = { version: 1 as const, project: { id: "app" }, runtimeDir: "new-runtime", profiles: { default: {} } };
    expect((await readReceipt(changed, root, "instance"))?.runtimeDir).toBe(receipt.runtimeDir);
  });
});
