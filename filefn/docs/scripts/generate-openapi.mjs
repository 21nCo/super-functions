#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, "..");
const repoRoot = resolve(docsRoot, "..", "..");
const outDir = join(docsRoot, "content", "api");
const outFile = join(outDir, "filefn.json");

const contractPath = resolve(
  repoRoot,
  "filefn",
  "server",
  "contracts",
  "filefn-client-v1.openapi.json",
);

const raw = readFileSync(contractPath, "utf8");
const document = JSON.parse(raw);

const annotated = {
  ...document,
  info: {
    ...(document.info ?? {}),
    title: "FileFn API",
    description:
      "The canonical FileFn HTTP surface as exposed by `createFileFn(...)` " +
      "from `@filefn/server`. The schema is the same shape that `@filefn/client`, " +
      "the Python `filefn` package, and `FileFnClient` in `AuthFnSwift` consume. " +
      "Routes that depend on optional capabilities (grants, share links, " +
      "processing artifacts) are exposed only when the matching configuration " +
      "is enabled at deploy time.",
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(annotated, null, 2) + "\n", "utf8");

const operationCount = Object.values(annotated.paths ?? {}).reduce(
  (count, methods) => count + Object.keys(methods ?? {}).length,
  0,
);

console.log(
  `Wrote ${outFile} (${Object.keys(annotated.paths ?? {}).length} paths, ${operationCount} operations)`,
);
