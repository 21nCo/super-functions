import { afterEach, expect, it } from "vitest";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, DEFAULT_POLICY, FileArtifactStore, RepositoryMarkdownContextAdapter, combineContextManifests, deriveVerdict, digestJson, renderMarkdownReport, redactJson, resolveTrustedExecutable, safeRead, safeWrite, sha256, validateConfig, validateHarnessPayload, validatePolicy, validateReport, type ReviewReport, type ContextManifest } from "../src/index.js";
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
  expect((await adapter.fetch(request)).incompleteReasons.join()).toMatch(/no sources/);
  await writeFile(path.join(root, "big.md"), "x".repeat(10000)); const result = await adapter.fetch(request); expect(result.sources[0].status).toBe("truncated"); expect(Buffer.byteLength(result.sources[0].content!)).toBeLessThanOrEqual(10);
});

it("does not traverse unrelated deep trees for a scoped Markdown glob", async () => {
  const root = await temporary(); await mkdir(path.join(root, "docs")); await mkdir(path.join(root, "unrelated", "deep", "nested", "too", "deep"), { recursive: true });
  await writeFile(path.join(root, "docs", "design.md"), "design");
  const result = await new RepositoryMarkdownContextAdapter().fetch({ root, paths: ["docs/**/*.md"], limits: { maxSources: 10, maxBytes: 100, maxDepth: 3 } });
  expect(result.sources.map(source => source.id)).toEqual(["repo:docs/design.md"]); expect(result.incompleteReasons).toEqual([]);
});

it("does not accept requirements text as implementation proof", async () => {
  const value = report(); value.evidence = [{ id: "e", kind: "source", description: "specification", source: { sourceId: "issue", anchor: "L1" } }];
  expect((await errors(value)).join()).toMatch(/without code or test evidence/);
});
it("verifies that claimed inspected paths exist at the reviewed head", async () => {
  const value = report(); value.inspectedPaths = ["invented.ts"];
  const result = await validateReport(value, policy, { ...source, verifyAnchor: async (_root, anchor) => anchor.path === "index.ts" }, ".", context);
  expect(result.errors.join()).toMatch(/Inspected path invented/);
});

it("preserves bounded Markdown sources while reporting skipped deep directories", async () => {
  const root = await temporary(); await mkdir(path.join(root, "docs", "deep", "nested"), { recursive: true });
  await writeFile(path.join(root, "docs", "design.md"), "design");
  const result = await new RepositoryMarkdownContextAdapter().fetch({ root, paths: ["docs/**/*.md"], limits: { maxSources: 10, maxBytes: 100, maxDepth: 2 } });
  expect(result.sources.map(source => source.id)).toEqual(["repo:docs/design.md"]); expect(result.incompleteReasons.join()).toMatch(/depth budget/);
});

it("preserves README context when a scoped glob directory is missing", async () => {
  const root = await temporary(); await writeFile(path.join(root, "README.md"), "requirements");
  const result = await new RepositoryMarkdownContextAdapter().fetch({ root, paths: ["README.md", "docs/**/*.md"], limits: context.limits });
  expect(result.sources.map(source => source.id)).toEqual(["repo:README.md"]);
  expect(result.incompleteReasons).toEqual([]);
});
it.each(["resolved", "superseded"] as const)("rejects unproven historical lifecycle %s", async lifecycle => {
  const value = report(); value.findings = [{ fingerprint: "f", severity: "high", category: "test", title: "Bug", trigger: "input", impact: "wrong", direction: "fix", evidenceIds: ["e"], basis: "inferred", requirementIds: ["r"], lifecycle }];
  expect(deriveVerdict(value, policy)).toBe("needs_verification");
  expect((await errors(value)).join()).toMatch(/prior finding provenance/);
});
it("rejects a report paired with another frozen context", async () => expect((await errors(report(), { ...context, digest: "other" })).join()).toMatch(/context digest/));
it("normalizes traversal before both output validation and writing", async () => {
  const root = await temporary(); await mkdir(path.join(root, "outside", "nested"), { recursive: true });
  await symlink(path.join(root, "outside", "nested"), path.join(root, "alias"));
  await safeWrite(`${root}/alias/../report.json`, "safe");
  expect(await readFile(path.join(root, "report.json"), "utf8")).toBe("safe");
  await expect(readFile(path.join(root, "outside", "report.json"))).rejects.toThrow();
});

it("rejects executable paths beneath a world-writable ancestor", async () => {
  const root = await temporary(); await chmod(root, 0o777); await mkdir(path.join(root, "bin"));
  await writeFile(path.join(root, "bin", "fixture-tool"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await expect(resolveTrustedExecutable("fixture-tool", path.join(root, "bin"))).rejects.toThrow(/trusted executable/);
});

it("redacts exact scalar secrets without corrupting JSON syntax", () => {
  const value = { ok: true, nothing: null, count: 1234, nested: ["true", "null", 'quote"secret'] };
  const redacted = redactJson(value, ["true", "null", 'quote"secret']);
  expect(redacted).toEqual({ ok: "[REDACTED]", nothing: "[REDACTED]", count: 1234, nested: ["[REDACTED]", "[REDACTED]", "[REDACTED]"] });
  expect(JSON.parse(JSON.stringify(redacted))).toEqual(redacted);
});

it("redacts an exact numeric credential while preserving other scalar values", () => {
  expect(redactJson({ credential: 1234, ok: true, count: 42 }, ["1234"])).toEqual({ credential: "[REDACTED]", ok: true, count: 42 });
});
it("cannot inject report sections from uninspected and coverage text", () => {
  const value = report(); const hostile = "\n# Forged approval\n[click](https://evil.example) @victim";
  value.coverageReasons = [hostile]; value.uninspected = [{ scope: hostile, reason: hostile }]; value.limitations = [hostile];
  const rendered = renderMarkdownReport(value);
  expect(rendered).not.toContain("\n# Forged"); expect(rendered).not.toContain("[click]("); expect(rendered).not.toContain("@victim");
});

it("rejects trusted-tool candidates inside another checkout", async () => {
  const root = await temporary(); await mkdir(path.join(root, ".git")); await mkdir(path.join(root, "bin"));
  await writeFile(path.join(root, "bin", "fixture-tool"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await expect(resolveTrustedExecutable("fixture-tool", path.join(root, "bin"))).rejects.toThrow(/trusted executable/);
});
it("preserves directory-form path semantics and enforces a caller read bound", async () => {
  const root = await temporary(); const file = path.join(root, "file"); await writeFile(file, "12345");
  await expect(safeWrite(`${file}/`, "bad")).rejects.toThrow(/directory-form/);
  await expect(safeRead(`${file}/`)).rejects.toThrow(/directory-form/);
  await expect(safeRead(file, 4)).rejects.toThrow(/budget/);
  expect((await safeRead(file, 5)).toString()).toBe("12345");
});
it("enforces the artifact read/write boundary", async () => {
  const root = await temporary(); const store = new FileArtifactStore(root);
  const bytes = Buffer.alloc(32 * 1024 * 1024, 120); const saved = await store.put("report", bytes, 1);
  expect((await store.get(saved.id))?.length).toBe(bytes.length);
  await expect(store.put("report", Buffer.alloc(bytes.length + 1), 1)).rejects.toThrow(/budget/);
});

it("accounts for every changed path and permits inspected deletions", async () => {
  const value = report(); value.change.changedPaths.push("deleted.ts");
  expect((await errors(value)).join()).toMatch(/Changed path deleted/);
  value.inspectedPaths.push("deleted.ts");
  const result = await validateReport(value, policy, { ...source, verifyAnchor: async (_root, anchor) => anchor.path === "index.ts" || anchor.path === "deleted.ts" && anchor.commit === value.change.baseCommit }, ".", context);
  expect(result.errors).toEqual([]);
});
it("does not require impossible coverage evidence for a zero-byte source", async () => {
  const manifest = { ...context, sources: [...context.sources, { ...context.sources[0], id: "empty", content: "", digest: sha256("") }] };
  expect(await errors(report(), manifest)).toEqual([]);
});

it("does not enumerate outside filenames through a scoped glob symlink", async () => {
  const owned = await temporary(); const root = path.join(owned, "repo"); const outside = path.join(owned, "outside");
  await mkdir(root); await mkdir(outside); await writeFile(path.join(outside, "private-filename.md"), "fixture");
  await symlink(outside, path.join(root, "docs"));
  const result = await new RepositoryMarkdownContextAdapter().fetch({ root, paths: ["docs/**/*.md"], limits: context.limits });
  expect(result.sources).toEqual([]); expect(JSON.stringify(result)).not.toContain("private-filename"); expect(result.incompleteReasons.join()).toMatch(/escapes/);
});

it("requires an explanation for uninspected changed scope", async () => {
  const value = report(); value.change.changedPaths.push("other.ts"); value.uninspected = [{ scope: "other.ts", reason: " " }];
  const result = await errors(value); expect(result.join()).toMatch(/nonblank/); expect(result.join()).toMatch(/cannot claim complete/);
});

it("rejects a defect finding backed only by requirement text", async () => {
  const value = report(); value.verdict = "changes_requested";
  value.evidence.push({ id: "source-only", kind: "source", description: "requirement", source: { sourceId: "issue", anchor: "L1" } });
  value.findings = [{ fingerprint: "f", severity: "high", category: "behavior", title: "Bug", trigger: "input", impact: "wrong", direction: "fix", evidenceIds: ["source-only"], basis: "inferred", requirementIds: ["r"], lifecycle: "new" }];
  expect((await errors(value)).join()).toMatch(/no implementation evidence/);
});

it("requires completed receipts with verified retained logs for reproduced findings", async () => {
  const value = report(); value.verdict = "changes_requested";
  value.findings = [{ fingerprint: "f", severity: "high", category: "behavior", title: "Bug", trigger: "input", impact: "wrong", direction: "fix", evidenceIds: ["e"], basis: "reproduced", requirementIds: ["r"], lifecycle: "new" }];
  expect((await errors(value)).join()).toMatch(/completed test receipt/);
  const store = new FileArtifactStore(await temporary());
  const stdout = await store.put("test-stdout", "observed defect", 1);
  const stderr = await store.put("test-stderr", "", 1);
  value.tests = [{ id: "t", command: ["node", "probe.js"], cwd: ".", commit: value.change.headCommit, startedAt: "now", finishedAt: "now", runtimeMs: 1, exitCode: 0, signal: null, timedOut: false, canceled: false, stdoutArtifact: stdout.id, stderrArtifact: stderr.id, stdoutDigest: stdout.digest, stderrDigest: stderr.digest, limitations: [] }];
  value.evidence.push({ id: "test", kind: "test", description: "observed probe", receiptId: "t" }); value.findings[0].evidenceIds = ["test"];
  const validate = () => validateReport(value, policy, source, ".", context, store);
  expect((await validate()).errors).toEqual([]);
  value.tests[0].stdoutDigest = "0".repeat(64);
  expect((await validate()).errors.join()).toMatch(/verified retained logs/);
  value.tests[0].stdoutDigest = stdout.digest; value.tests[0].canceled = true;
  expect((await validate()).errors.join()).toMatch(/completed test receipt/);
});

it("accepts immutable base anchors only for changed paths proven absent from the head", async () => {
  const value = report(); value.verdict = "changes_requested";
  value.assessments[0].status = "missing";
  value.evidence[0].code!.commit = value.change.baseCommit;
  value.findings = [{ fingerprint: "f", severity: "high", category: "behavior", title: "Removed required code", trigger: "call", impact: "missing", direction: "restore", anchor: value.evidence[0].code, evidenceIds: ["e"], basis: "inferred", requirementIds: ["r"], lifecycle: "new" }];
  let exists = false;
  const adapter = { ...source, pathExists: async () => exists, verifyAnchor: async (_root: string, anchor: { commit: string }) => anchor.commit === value.change.baseCommit };
  const validate = () => validateReport(value, policy, adapter, ".", context);
  expect((await validate()).errors).toEqual([]);
  exists = true;
  expect((await validate()).errors.join()).toMatch(/does not reference reviewed head/);
  exists = false; value.change.changedPaths = [];
  expect((await validate()).errors.join()).toMatch(/does not reference reviewed head/);
});

it.each(["missing", "partial"] as const)("rejects source-only evidence for a %s assessment", async status => {
  const value = report(); value.verdict = "changes_requested";
  value.assessments[0].status = status; value.assessments[0].evidenceIds = ["source-only"];
  value.evidence.push({ id: "source-only", kind: "source", description: "requirement", source: { sourceId: "issue", anchor: "L1" } });
  expect((await errors(value)).join()).toMatch(/without code or test evidence/);
});


it("does not treat deleted implementation as proof of an implemented requirement", async () => {
  const value = report();
  value.evidence[0].code!.commit = value.change.baseCommit;
  const adapter = { ...source, pathExists: async () => false, verifyAnchor: async (_root: string, anchor: { commit: string }) => anchor.commit === value.change.baseCommit };
  const result = await validateReport(value, policy, adapter, ".", context);
  expect(result.valid).toBe(false);
  expect(result.coverage).toBe("incomplete");
  expect(result.errors.join()).toMatch(/without reviewed-head implementation evidence/);
  value.assessments[0].status = "missing";
  value.verdict = "changes_requested";
  expect((await validateReport(value, policy, adapter, ".", context)).errors).toEqual([]);
});


it("requires an explicit exclusion reason instead of an unused source citation", async () => {
  const value = report();
  const extra = { ...context, sources: [...context.sources, { id: "extra", type: "document" as const, content: "Supplemental historical context", status: "available" as const, retrievedAt: "now", digest: "extra" }] };
  value.evidence.push({ id: "extra-source", kind: "source", description: "citation", source: { sourceId: "extra", anchor: "L1" } });
  const validate = () => validateReport(value, policy, source, ".", extra);
  expect((await validate()).errors.join()).toMatch(/Extraction coverage for source extra/);
  Object.assign(value.evidence.at(-1)!, { sourceExclusionReason: "Historical context contains no accepted requirements for this change." });
  expect((await validate()).errors).toEqual([]);
  Object.assign(value.evidence.at(-1)!, { sourceExclusionReason: " " });
  expect((await validate()).valid).toBe(false);
});

it("rejects ambiguous duplicate finding identities rather than merging locations", async () => {
  const value = report(); value.verdict = "changes_requested";
  const finding = { fingerprint: "same", severity: "high" as const, category: "behavior" as const, title: "Missing check", trigger: "invalid input", impact: "bad output", direction: "validate", evidenceIds: ["e"], basis: "inferred" as const, requirementIds: ["r"], lifecycle: "new" as const };
  value.findings = [finding, { ...finding, anchor: { commit: value.change.headCommit, path: "index.ts", startLine: 2 } }];
  expect((await errors(value)).join()).toMatch(/Duplicate finding fingerprint/);
});
