import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { waitForReadiness } from "../src/index.js";

describe("process readiness", () => {
  it("keeps command probes inside the overall readiness deadline", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-readiness-"));
    const marker = path.join(root, "attempted");
    const probe = path.join(root, "probe.mjs");
    await writeFile(probe, `import { access, writeFile } from "node:fs/promises";\ntry { await access(${JSON.stringify(marker)}); await new Promise((resolve) => setTimeout(resolve, 1000)); } catch { await writeFile(${JSON.stringify(marker)}, "1"); process.exit(1); }\n`);
    const started = Date.now();
    await expect(waitForReadiness({ health: { type: "command", command: [process.execPath, probe], timeoutMs: 220 }, ports: {}, logPath: path.join(root, "unused.log"), cwd: root, environment: process.env, isAlive: () => true })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(400);
  });
});
