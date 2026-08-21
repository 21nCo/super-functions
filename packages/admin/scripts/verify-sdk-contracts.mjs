import { access, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const results = [];
const transport = {
  registry: async () => [],
  invokeOperation: async () => ({ ok: true, data: {} }),
  invokeOperationRaw: async () => ({ response: new Response(), payload: { ok: true, data: {} } }),
};
for (const name of (await readdir(repositoryRoot)).filter((entry) => entry.endsWith("fn")).sort()) {
  const entry = join(repositoryRoot, name, "admin", "dist", "index.js");
  try { await access(entry); } catch { continue; }
  const exports = await import(pathToFileURL(entry).href);
  const manifest = exports.adminCapability
    ?? Object.values(exports).find((value) => value?.schemaVersion === "1.0" && value?.id === name);
  if (!manifest || ["folded", "unavailable"].includes(manifest.availability)) continue;
  const factories = Object.entries(exports).filter(([key, value]) => /^create[A-Za-z0-9]+AdminClient$/.test(key) && typeof value === "function");
  if (factories.length !== 1) {
    results.push({ moduleId: name, status: "fail", reason: `Expected one named admin client factory, found ${factories.length}.` });
    continue;
  }
  const [factoryName, factory] = factories[0];
  const client = factory(transport);
  const missing = ["operations", "availability", "invoke", "raw", "pages"].filter((key) => key === "operations" ? !client[key] : typeof client[key] !== "function");
  results.push({
    moduleId: name,
    factory: factoryName,
    operationCount: Object.keys(client.operations ?? {}).length,
    status: missing.length === 0 && Object.keys(client.operations).length === manifest.operations.length ? "pass" : "fail",
    ...(missing.length ? { missing } : {}),
  });
}
const report = {
  schemaVersion: "1.0",
  summary: { reviewed: results.length, passed: results.filter((result) => result.status === "pass").length, failed: results.filter((result) => result.status === "fail").length },
  results,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.summary.failed > 0) process.exitCode = 1;
