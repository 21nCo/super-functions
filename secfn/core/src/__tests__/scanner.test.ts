import { describe, expect, it, vi } from "vitest";
import { createSecurityScanner } from "../scanner/scanner.js";
import { formatFindingsSarif, formatFindingsJson } from "../scanner/reporters.js";

describe("security scanner", () => {
  it("detects default secret rules in content", () => {
    const scanner = createSecurityScanner();
    const findings = scanner.scanContent(
      "const key = 'sk-test1234567890abcdefghijklmnopqrstuvwxyz';",
      { path: "config.ts" },
    );

    expect(findings.some((finding) => finding.ruleId === "secret.openai_key")).toBe(true);
    expect(findings[0].redactedMatch).toContain("...");
  });

  it("renders SARIF output", () => {
    const scanner = createSecurityScanner();
    const findings = scanner.scanContent("AKIAIOSFODNN7EXAMPLE", { path: "aws.txt" });
    const sarif = JSON.parse(formatFindingsSarif(findings));

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].results[0].ruleId).toBe("secret.aws_access_key");
  });
});

it('omits plaintext matches and context from JSON reports', () => {
  const secret = 'AKIAIOSFODNN7EXAMPLE';
  const findings = createSecurityScanner().scanContent(secret, { path: 'aws.txt' });
  expect(findings.length).toBeGreaterThan(0);
  const report = formatFindingsJson(findings);
  expect(report).not.toContain(secret);
  expect(JSON.parse(report).findings[0]).not.toHaveProperty('context');
  expect(JSON.parse(report).findings[0]).not.toHaveProperty('match');
});

it('scans an exact byte limit and rejects larger input',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const dir=await mkdtemp(`${tmpdir()}/rex-scanner-`);
 try {
  const secret='AKIAIOSFODNN7EXAMPLE';const file=`${dir}/key`;
  const scanner=createSecurityScanner({maxFileSize:Buffer.byteLength(secret)});
  await writeFile(file,secret);expect(await scanner.scanFile(file)).toHaveLength(1);
  await writeFile(file,secret+'x');expect(await scanner.scanFile(file)).toEqual([]);
 }finally{await rm(dir,{recursive:true});}
});

it("does not allocate the configured ceiling for a tiny file", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(`${tmpdir()}/rex-small-scan-`);
  try {
    await writeFile(`${dir}/key`, "AKIAIOSFODNN7EXAMPLE");
    const allocate = Buffer.alloc;
    const spy = vi.spyOn(Buffer, "alloc").mockImplementation((size) => {
      if (size > 64 * 1024) throw new Error("Eager allocation");
      return allocate(size);
    });
    try { expect(await createSecurityScanner({ maxFileSize: 2 ** 32 - 1 }).scanFile(`${dir}/key`)).toHaveLength(1); } finally { spy.mockRestore(); }
  } finally { await rm(dir, { recursive: true }); }
});

it("propagates rule evaluation failures from directory scans", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(`${tmpdir()}/rex-rule-failure-`);
  try {
    await writeFile(`${dir}/input.txt`, "scan me");
    const scanner = createSecurityScanner({
      rulePacks: [{
        id: "failing-pack",
        name: "Failing pack",
        rules: [{
          id: "failing-rule",
          name: "Failing rule",
          description: "throws during evaluation",
          severity: "high",
          evaluate() { throw new Error("rule evaluation failed"); },
        }],
      }],
    });

    await expect(scanner.scanDirectory(dir)).rejects.toThrow("rule evaluation failed");
  } finally {
    await rm(dir, { recursive: true });
  }
});

it("does not follow file or directory symlinks outside the scan root", async () => {
  const { mkdtemp, mkdir, writeFile, symlink, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const base = await mkdtemp(`${tmpdir()}/rex-symlink-scan-`);
  const root = join(base, "root");
  const outside = join(base, "outside");
  try {
    await mkdir(root);
    await mkdir(outside);
    const secret = join(outside, "secret.txt");
    await writeFile(secret, "AKIAIOSFODNN7EXAMPLE");
    await symlink(outside, join(root, "linked-directory"));
    await symlink(secret, join(root, "linked-file"));

    await expect(createSecurityScanner().scanDirectory(root)).resolves.toEqual([]);
  } finally {
    await rm(base, { recursive: true });
  }
});
