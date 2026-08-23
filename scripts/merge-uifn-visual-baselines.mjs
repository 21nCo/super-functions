#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("usage: node scripts/merge-uifn-visual-baselines.mjs <manifest...>");
  process.exit(1);
}

const hashes = {};
const robustHashes = {};
for (const input of inputs) {
  const manifest = JSON.parse(readFileSync(path.resolve(root, input), "utf8"));
  if (
    manifest.schemaVersion !== 2 ||
    !manifest.hashes ||
    typeof manifest.hashes !== "object" ||
    !manifest.robustHashes ||
    typeof manifest.robustHashes !== "object"
  ) {
    throw new Error(`invalid visual baseline manifest: ${input}`);
  }
  for (const key of Object.keys(manifest.hashes)) {
    if (!Array.isArray(manifest.robustHashes[key]) || manifest.robustHashes[key].length !== 4) {
      throw new Error(`visual baseline is missing threshold hashes for ${key}: ${input}`);
    }
  }
  Object.assign(hashes, manifest.hashes);
  Object.assign(robustHashes, manifest.robustHashes);
}

const output = {
  schemaVersion: 2,
  hashes: Object.fromEntries(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right))),
  robustHashes: Object.fromEntries(Object.entries(robustHashes).sort(([left], [right]) => left.localeCompare(right))),
};
const outputPath = path.resolve(root, "uifn/examples/browser-qa/baselines/visual-hashes.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  output: path.relative(root, outputPath),
  baselineCount: Object.keys(hashes).length,
  thresholdBaselineCount: Object.keys(robustHashes).length,
}, null, 2));
