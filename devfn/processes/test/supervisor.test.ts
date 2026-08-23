import { closeSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { prepareProcessLog } from "../src/supervisor.js";

describe("process supervision", () => {
  it("clears historical output before starting a secret-bearing process", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-sensitive-log-"));
    const runtimeDir = path.join(root, ".devfn", "instances", "test");
    const logPath = path.join(runtimeDir, "logs", "app.log");
    await mkdir(path.dirname(logPath), { recursive: true });
    await writeFile(logPath, "historical-secret\n", "utf8");
    const { logFd, logOffset } = await prepareProcessLog(logPath, true);
    closeSync(logFd);
    expect(logOffset).toBe(0);
    expect(await readFile(logPath, "utf8")).not.toContain("historical-secret");
  });
});
