import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const cli = process.env.DOCSFN_WATCH_TEST_CLI ?? fileURLToPath(new URL("../dist/index.js", import.meta.url));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, output) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for dev rebuild:\n${output()}`);
}

for (const outDir of [".", "content", "build/deep/output"]) {
  test(`dev watches Markdown inside output ancestor ${outDir} without feedback loops`, async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "docsfn-dev-output-"));
    let child;
    let output = "";
    try {
      const content = join(root, "content/docs");
      await fs.mkdir(content, { recursive: true });
      const page = join(content, "index.md");
      await fs.writeFile(page, "# Original page\n");
      await fs.writeFile(
        join(root, "docsfn.config.mjs"),
        `export default {schemaVersion:1,site:{title:"Watch"},content:{root:".",docsDir:"content/docs"},search:{enabled:false,scopes:["docs"]}};`
      );
      child = spawn(process.execPath, [cli, "dev", root, "--out-dir", outDir], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (data) => {
          output += data;
        });
      const manifest = join(root, outDir, "manifest.json");
      await waitFor(
        () => output.includes("Watching for changes"),
        () => output
      );
      // Let queued output-directory creation events settle before editing.
      await sleep(1000);
      await fs.writeFile(page, "# Changed page\n");
      await waitFor(
        async () => {
          try {
            return (await fs.readFile(manifest, "utf8")).includes("Changed page");
          } catch {
            return false;
          }
        },
        () => output
      );
      await sleep(700);
      const count = (output.match(/dev:rebuild:/g) ?? []).length;
      await sleep(1000);
      assert.equal(
        (output.match(/dev:rebuild:/g) ?? []).length,
        count,
        "generated publication must not trigger new rebuilds"
      );
      assert.equal(child.exitCode, null, "dev must remain running");
    } finally {
      if (child && child.exitCode === null) {
        const stopped = new Promise((resolve) => child.once("close", resolve));
        child.kill("SIGTERM");
        await stopped;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
