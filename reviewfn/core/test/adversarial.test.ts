import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, DEFAULT_POLICY, FileArtifactStore, RepositoryMarkdownContextAdapter, combineContextManifests, deriveVerdict, digestJson, safeWrite, sha256, validateConfig, validateHarnessPayload, validatePolicy, validateReport, type ReviewReport, type ContextManifest } from "../src/index.js";
const roots: string[] = [];
async function temporary() { const root = await mkdtemp(path.join(tmpdir(), "reviewfn-security-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const context: ContextManifest = { version: 1, sources: [{ id: "issue", type: "issue", status: "available", content: "Return 1", digest: sha256("Return 1"), retrievedAt: "now" }], selection: { candidates: ["issue"], selected: ["issue"], rule: "explicit" }, limits: { maxSources: 10, maxBytes: 1000, maxDepth: 3 }, incompleteReasons: [], digest: "digest" };
const policy = { ...DEFAULT_POLICY, requiredCategories: ["behavior" as const] };
function report(): ReviewReport {
  return { schemaVersion: 1, runId: "run", attemptId: "attempt", createdAt: "now", change: { repositoryId: "test", host: "local", targetBranch: "main", baseCommit: "a".repeat(40), headCommit: "b".repeat(40), mergeBaseCommit: "a".repeat(40), diffDigest: "d".repeat(64), changedPaths: ["index.ts"], capturedAt: "now" }, contextManifestDigest: "digest", contextManifestArtifact: "context", configuration: { schemaVersion: 1, policyDigest: "p", promptDigest: "p", harness: { id: "fake", version: "1" }, inference: { provider: "fake", model: "fake", auth: "none" }, execution: { adapter: "fake", timeoutMs: 1, maxOutputBytes: 1 }, contextAdapters: [], profile: "test" }, execution: "completed", coverage: "complete", coverageReasons: [], verdict: "ready", requirements: [{ id: "r", statement: "Return 1", sources: [{ sourceId: "issue", anchor: "L1" }], category: "behavior", scope: "API", classification: "mandatory", dependencies: [], extraction: { harness: "fake", promptDigest: "p" } }], assessments: [{ requirementId: "r", status: "implemented", evidenceIds: ["e"], reasoning: "code", gaps: [], confidence: 1 }], evidence: [{ id: "e", kind: "code", description: "return", code: { commit: "b".repeat(40), path: "index.ts", startLine: 1 } }], findings: [], tests: [], inspectedPaths: ["index.ts"], uninspected: [], limitations: [] };
}
const source = { id: "fake", capture: async () => report().change, currentHead: async () => "b".repeat(40), verifyAnchor: async () => true };
async function errors(value: ReviewReport, manifest = context) { return (await validateReport(value, policy, source, ".", manifest)).errors; }
it("validates the positive control against source and code", async () => expect(await errors(report())).toEqual([]));
it.each(["requirements", "assessments", "evidence", "findings", "inspectedPaths", "uninspected"])("rejects missing structured field %s", key => {
  const value: Record<string, unknown> = { requirements: [], assessments: [], evidence: [], findings: [], inspectedPaths: [], uninspected: [] }; delete value[key]; expect(validateHarnessPayload(value).length).toBeGreaterThan(0);
});
it("rejects invented assessment statuses at the runtime boundary", () => {
  const value = report(); value.assessments[0].status = "approved" as never;
  expect(validateHarnessPayload({ requirements: value.requirements, assessments: value.assessments, evidence: value.evidence, findings: [], inspectedPaths: [], uninspected: [] }).join()).toMatch(/allowed values/);
});
it("rejects fake code, receipt, and artifact evidence", async () => {
  for (const kind of ["code", "test", "artifact"] as const) { const value = report(); value.evidence = [{ id: "e", kind, description: "unsupported", receiptId: "invented", artifactDigest: "e".repeat(64) }]; expect((await errors(value)).length).toBeGreaterThan(0); }
});
it("rejects invented, inaccessible, and unauthorized waivers", async () => {
  const value = report(); value.assessments[0].status = "not_applicable"; value.assessments[0].waiverReference = { sourceId: "issue", anchor: "L1" };
  expect((await errors(value)).join()).toMatch(/waiver/);
  value.assessments[0].waiverReference.sourceId = "invented"; expect((await errors(value)).join()).toMatch(/waiver/);
});
it("rejects fabricated source anchors and disabled comments", async () => {
  const value = report(); value.requirements[0].sources[0].anchor = "L500";
  expect((await errors(value)).join()).toMatch(/unauthorized source/);
  value.requirements[0].sources[0].anchor = "L1";
  const result = await validateReport(value, { ...policy, sourceAuthority: { ...policy.sourceAuthority, commentsMayClarify: false } }, source, ".", { ...context, sources: [{ ...context.sources[0], type: "comment" }] });
  expect(result.valid).toBe(false);
});
it("does not accept empty extraction or absent inspection", async () => { const value = report(); value.requirements = []; value.assessments = []; value.inspectedPaths = []; expect((await errors(value)).join()).toMatch(/No requirements/); });
it("keeps revalidation findings non-ready", () => { const value = report(); value.findings = [{ fingerprint: "f", severity: "high", category: "test", title: "Bug", trigger: "input", impact: "wrong", direction: "fix", evidenceIds: ["e"], basis: "inferred", requirementIds: ["r"], lifecycle: "needs_revalidation" }]; expect(deriveVerdict(value, policy)).toBe("needs_verification"); });
it.each(Object.keys(DEFAULT_POLICY.limits))("requires policy bound %s", key => { const value = structuredClone(DEFAULT_POLICY); delete (value.limits as unknown as Record<string, unknown>)[key]; expect(() => validatePolicy(value)).toThrow(/positive integer/); });
it("rejects unsupported execution adapters", () => expect(() => validateConfig({ ...DEFAULT_CONFIG, execution: { ...DEFAULT_CONFIG.execution, adapter: "remote" } })).toThrow(/Unsupported execution/));
it("rejects cyclic arrays", () => { const value: unknown[] = []; value.push(value); expect(() => digestJson(value)).toThrow(/cycles/); });
it("keeps context identity stable across retrieval times and enforces aggregate bounds", () => {
  const first = combineContextManifests([context], context.limits);
  const second = combineContextManifests([{ ...context, sources: [{ ...context.sources[0], retrievedAt: "later" }] }], context.limits);
  expect(first.digest).toBe(second.digest);
  expect(combineContextManifests([context, context], { ...context.limits, maxSources: 1 }).incompleteReasons.join()).toMatch(/Aggregate/);
});
it("does not follow metadata, output, or parent symlinks", async () => {
  const root = await temporary(); const victim = path.join(root, "victim"); await writeFile(victim, "safe");
  await symlink(victim, path.join(root, "report.json")); await expect(safeWrite(path.join(root, "report.json"), "bad")).rejects.toThrow();
  await mkdir(path.join(root, "real")); await symlink(path.join(root, "real"), path.join(root, "parent")); await expect(safeWrite(path.join(root, "parent", "report.json"), "bad")).rejects.toThrow();
  const store = new FileArtifactStore(path.join(root, "artifacts")); const saved = await store.put("report", "body", 1);
  await rm(path.join(root, "artifacts", `${saved.id}.json`)); await symlink(victim, path.join(root, "artifacts", `${saved.id}.json`)); await expect(store.put("report", "body", 1)).rejects.toThrow();
  expect(await readFile(victim, "utf8")).toBe("safe");
});
it("refuses retention metadata traversal without deleting outside files", async () => {
  const root = await temporary(); const store = new FileArtifactStore(path.join(root, "artifacts")); await store.put("report", "body", 1);
  await writeFile(path.join(root, "victim.artifact"), "safe"); await writeFile(path.join(root, "artifacts", "evil.json"), JSON.stringify({ id: "../victim", expiresAt: "2000-01-01" }));
  const result = await store.deleteExpired(); expect(result.errors.join()).toMatch(/Invalid artifact/); expect(await readFile(path.join(root, "victim.artifact"), "utf8")).toBe("safe");
});
it("marks unmatched Markdown sources incomplete and bounds large files", async () => {
  const root = await temporary(); const adapter = new RepositoryMarkdownContextAdapter();
  const request = { root, paths: ["**/*.md"], limits: { maxSources: 1, maxBytes: 10, maxDepth: 2 } };
  await expect(adapter.fetch(request)).rejects.toThrow(/no sources/);
  await writeFile(path.join(root, "big.md"), "x".repeat(10000)); const result = await adapter.fetch(request); expect(result.sources[0].status).toBe("truncated"); expect(Buffer.byteLength(result.sources[0].content!)).toBeLessThanOrEqual(10);
});

it("does not traverse unrelated deep trees for a scoped Markdown glob", async () => {
  const root = await temporary(); await mkdir(path.join(root, "docs")); await mkdir(path.join(root, "unrelated", "deep", "nested", "too", "deep"), { recursive: true });
  await writeFile(path.join(root, "docs", "design.md"), "design");
  const result = await new RepositoryMarkdownContextAdapter().fetch({ root, paths: ["docs/**/*.md"], limits: { maxSources: 10, maxBytes: 100, maxDepth: 3 } });
  expect(result.sources.map(source => source.id)).toEqual(["repo:docs/design.md"]); expect(result.incompleteReasons).toEqual([]);
});
