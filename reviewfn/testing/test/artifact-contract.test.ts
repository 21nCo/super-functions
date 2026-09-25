import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { FileArtifactStore } from "@superfunctions/reviewfn-core";
import { MemoryArtifactStore } from "../src/index.js";

it("uses the same byte digest and identifiers as the real artifact store", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "reviewfn-memory-contract-"));
  try {
    const content = Buffer.from([0, 255, 1, 128]);
    const memory = new MemoryArtifactStore();
    const disk = new FileArtifactStore(root);
    const saved = await memory.put("test-log", content);
    expect(saved).toEqual({ digest: "edc81f7e4ee358fb91e94bd9bd74079c3dcba36f40f2c8a36e7ae0567afecc8f", id: "test-log-edc81f7e4ee358fb91e94bd9bd74079c3dcba36f40f2c8a36e7ae0567afecc8f" });
    expect(saved).toEqual(await disk.put("test-log", content, 1));
    expect(await memory.get(saved.id)).toEqual(await disk.get(saved.id));
  } finally { await rm(root, { recursive: true, force: true }); }
});
