import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { createScopedPathInterpolator, readComposeEnvDefinitions } from "../src/path-interpolation.js";

async function withDotenv(content: string, check: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-path-contract-"));
  try {
    await writeFile(path.join(root, ".env"), content);
    await check(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

it("uses the declaration that supplied a selected path, before later reassignment", async () => {
  await withDotenv("DIR=service\nFILE_PATH=${DIR}.env\nDIR=${HOME}\n", async (root) => {
    const interpolate = createScopedPathInterpolator({ HOME: "/private" }, Date.now() + 5_000, new Set(["HOME"]));
    expect(await interpolate(["${FILE_PATH}"], root)).toEqual(["service.env"]);
  });
});

it("rejects inherited input captured before a later safe reassignment", async () => {
  await withDotenv("DIR=${HOME}\nFILE_PATH=${DIR}.env\nDIR=service\n", async (root) => {
    const interpolate = createScopedPathInterpolator({ HOME: "/private" }, Date.now() + 5_000, new Set(["HOME"]));
    await expect(interpolate(["${FILE_PATH}"], root)).rejects.toThrow(/undeclared host or secret/);
  });
});

it("reads Compose whitespace in dotenv declarations", async () => {
  await withDotenv("\u00a0FILE_PATH=service.env\n", async (root) => {
    expect((await readComposeEnvDefinitions(path.join(root, ".env"))).get("FILE_PATH")).toBe("service.env");
  });
});

it("bounds acyclic dotenv expansion before materialization", async () => {
  const chain = ["A0=a"];
  for (let index = 1; index <= 22; index += 1) {
    const reference = `\${A${index - 1}}`;
    chain.push(`A${index}=${reference}${reference}`);
  }
  await withDotenv(chain.join("\n"), async (root) => {
    const started = Date.now();
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${A22}"], root)).rejects.toThrow(/value limit|aggregate byte limit/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
