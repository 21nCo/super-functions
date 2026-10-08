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
  await writeFile(path.join(root, ".env"), "");
  const chain = Array.from({ length: 4000 }, (_, index) => {
    const value = index === 0 ? "ok" : `\${A${index - 1}}`;
    return `A${index}=${value}`;
  }).join("\n");
  await writeFile(path.join(root, "runtime.env"), `${chain}\n`);
  await writeFile(path.join(root, "compose.yaml"),
    "services:\n  api:\n    image: busybox\n    env_file: [runtime.env]\n");
  const started = Date.now();
  const active = await selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec));
  if (active.size || Date.now() - started > 3000) throw new Error("valid Compose alias chain exceeded the bounded control");
  const excessive = Array.from({ length: 5000 }, (_, index) => `A${index}=x`).join("\n");
  await writeFile(path.join(root, "runtime.env"), `${excessive}\n`);
  let overLimitRejected = false;
  try { await selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)); }
  catch { overLimitRejected = true; }
  if (!overLimitRejected) throw new Error("selected Compose reference fanout escaped the count limit");
  process.stdout.write("bounded and valid\n");
} finally { await rm(root, { recursive: true, force: true }); }
