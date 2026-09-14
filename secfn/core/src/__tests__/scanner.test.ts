import { describe, expect, it } from "vitest";
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
