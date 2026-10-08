import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createComposeEnvironment, selectedComposeEndpointReferences } from "../src/index.js";

const root = await mkdtemp(path.join(tmpdir(), "devfn-preview-budget-"));
try {
  const seed = "x".repeat(512 * 1024);
  const aliases = Array.from({ length: 1000 }, (_, index) => `A${index}=${"${SEED}"}x`);
  await writeFile(path.join(root, ".env"), `SEED=${seed}\n${aliases.join("\n")}\n`);
  const references = Array.from({ length: 1000 }, (_, index) => `\${A${index}}`).join("");
  await writeFile(path.join(root, "compose.yaml"),
    `services:\n  api:\n    image: busybox\n    command: '${references}'\n`);
  const spec = { adapter: "compose" as const, service: "api" };
  let rejected = false;
  try { await selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)); }
  catch { rejected = true; }
  if (!rejected) throw new Error("expanded Compose preview was not bounded");
  process.stdout.write("bounded\n");
} finally { await rm(root, { recursive: true, force: true }); }
