import type { SecurityFinding } from "../types.js";

const SEVERITY_ORDER = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
} as const;

export function findingMeetsSeverity(finding: SecurityFinding, minimum: keyof typeof SEVERITY_ORDER): boolean {
  return SEVERITY_ORDER[finding.severity] >= SEVERITY_ORDER[minimum];
}

export function formatFindingsTable(findings: SecurityFinding[]): string {
  if (findings.length === 0) {
    return "No security findings found.";
  }
  return findings
    .map((finding) =>
      [
        finding.severity.toUpperCase().padEnd(8),
        finding.ruleName,
        `${finding.file}:${finding.line}:${finding.column}`,
        finding.redactedMatch ?? "",
      ].filter(Boolean).join("  "),
    )
    .join("\n");
}

export function formatFindingsJson(findings: SecurityFinding[]): string {
  return JSON.stringify({ findings }, null, 2);
}

export function formatFindingsSarif(findings: SecurityFinding[]): string {
  const rules = new Map<string, SecurityFinding>();
  for (const finding of findings) {
    if (!rules.has(finding.ruleId)) rules.set(finding.ruleId, finding);
  }

  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "SecFn",
            informationUri: "https://github.com/21nCo/super-functions/tree/dev/secfn",
            rules: Array.from(rules.values()).map((finding) => ({
              id: finding.ruleId,
              name: finding.ruleName,
              shortDescription: { text: finding.ruleName },
              fullDescription: { text: finding.message },
              defaultConfiguration: {
                level: sarifLevel(finding.severity),
              },
            })),
          },
        },
        results: findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevel(finding.severity),
          message: {
            text: `${finding.message}${finding.redactedMatch ? ` (${finding.redactedMatch})` : ""}`,
          },
          partialFingerprints: {
            primaryLocationLineHash: finding.fingerprint,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: {
                  startLine: finding.line,
                  startColumn: finding.column,
                },
              },
            },
          ],
        })),
      },
    ],
  }, null, 2);
}

function sarifLevel(severity: SecurityFinding["severity"]): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium" || severity === "low") return "warning";
  return "note";
}
