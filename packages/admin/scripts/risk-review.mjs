import { readdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { reviewAdminMutationRisks } from "../dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const manifests = [];
for (const name of (await readdir(repositoryRoot)).filter((entry) => entry.endsWith("fn")).sort()) {
  const entry = join(repositoryRoot, name, "admin", "dist", "index.js");
  try {
    await access(entry);
  } catch {
    continue;
  }
  const exports = await import(pathToFileURL(entry).href);
  const manifest = exports.adminCapability
    ?? Object.values(exports).find((value) => value?.schemaVersion === "1.0" && value?.id === name);
  if (manifest && !["folded", "unavailable"].includes(manifest.availability)) manifests.push(manifest);
}
const reviews = reviewAdminMutationRisks(manifests);
const report = {
  schemaVersion: "1.0",
  generatedFrom: manifests.map((manifest) => `${manifest.id}@${manifest.version}`),
  summary: {
    reviewed: reviews.length,
    passed: reviews.filter((review) => review.status === "pass").length,
    failed: reviews.filter((review) => review.status === "fail").length,
  },
  reviews,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.summary.failed > 0) process.exitCode = 1;
