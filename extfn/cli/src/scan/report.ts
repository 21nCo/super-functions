import path from 'node:path';

import { redactValue } from 'clifn/diagnostics';

export type ScanSeverity = 'error' | 'warning' | 'info';
export type ScanCategory =
  | 'security'
  | 'permissions'
  | 'privacy'
  | 'performance'
  | 'packaging'
  | 'store-readiness';
export type ScanActionability = 'enforceable' | 'manual-review';

export interface ScanFinding {
  ruleId: string;
  severity: ScanSeverity;
  category: ScanCategory;
  actionability: ScanActionability;
  target: string;
  message: string;
  file?: string;
  details?: Record<string, unknown>;
}

export interface ScanTargetFile {
  absolutePath: string;
  relativePath: string;
  contents: string;
}

export interface ScanTargetInput {
  target: string;
  outputDir: string;
  manifestPath: string;
  manifest: Record<string, unknown>;
  files: readonly ScanTargetFile[];
}

export interface ScanReport {
  ok: boolean;
  strict: boolean;
  generatedAt: string;
  configPath: string;
  findings: readonly ScanFinding[];
  targets: readonly {
    target: string;
    outputDir: string;
    manifestPath: string;
  }[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    manualReviewCount: number;
  };
}

export interface StructuredLogEvent {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  target?: string;
  namespace?: string;
  method?: string;
  sourceContext?: string;
  payload?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface ScanRule {
  readonly id: string;
  evaluate(input: ScanTargetInput): ScanFinding[];
}

const SEVERITY_ORDER: Record<ScanSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function createScanFinding(
  input: ScanFinding
): ScanFinding {
  return {
    ...input,
    details: input.details
      ? ((redactValue(input.details) as Record<string, unknown>) ?? {})
      : undefined,
  };
}

export function sortScanFindings(
  findings: readonly ScanFinding[]
): ScanFinding[] {
  return [...findings]
    .map((finding) => createScanFinding(finding))
    .sort(
      (left, right) =>
        SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
        left.ruleId.localeCompare(right.ruleId) ||
        left.target.localeCompare(right.target) ||
        left.message.localeCompare(right.message) ||
        (left.file ?? '').localeCompare(right.file ?? '')
    );
}

export function createScanReport(input: {
  configPath: string;
  strict: boolean;
  targets: readonly {
    target: string;
    outputDir: string;
    manifestPath: string;
  }[];
  findings: readonly ScanFinding[];
}): ScanReport {
  const findings = sortScanFindings(input.findings);
  const summary = {
    errorCount: findings.filter((finding) => finding.severity === 'error').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    infoCount: findings.filter((finding) => finding.severity === 'info').length,
    manualReviewCount: findings.filter(
      (finding) => finding.actionability === 'manual-review'
    ).length,
  };

  return {
    ok: summary.errorCount === 0,
    strict: input.strict,
    generatedAt: new Date().toISOString(),
    configPath: input.configPath,
    findings,
    targets: input.targets.map((target) => ({
      target: target.target,
      outputDir: target.outputDir,
      manifestPath: target.manifestPath,
    })),
    summary,
  };
}

export function formatScanReportText(report: ScanReport): string {
  const lines = [
    `extfn scan: ${report.ok ? 'pass' : 'fail'}`,
    `config: ${report.configPath}`,
    `targets: ${report.targets.map((target) => target.target).join(', ')}`,
    `errors: ${report.summary.errorCount}, warnings: ${report.summary.warningCount}, manual-review: ${report.summary.manualReviewCount}`,
  ];

  for (const finding of report.findings) {
    lines.push(
      `- [${finding.severity}] ${finding.ruleId} (${finding.target} / ${finding.category} / ${finding.actionability}) ${finding.message}`
    );
    if (finding.file) {
      lines.push(`  file: ${finding.file}`);
    }
    if (finding.details) {
      lines.push(`  details: ${JSON.stringify(finding.details)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function formatScanReportSarif(report: ScanReport): string {
  const rules = Array.from(
    new Map(
      report.findings.map((finding) => [
        finding.ruleId,
        {
          id: finding.ruleId,
          name: finding.ruleId,
          shortDescription: {
            text: finding.message,
          },
          properties: {
            category: finding.category,
            actionability: finding.actionability,
          },
        },
      ])
    ).values()
  );

  return `${JSON.stringify(
    {
      version: '2.1.0',
      $schema:
        'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'extfn scan',
              rules,
            },
          },
          results: report.findings.map((finding) => ({
            ruleId: finding.ruleId,
            level: finding.severity === 'error' ? 'error' : 'warning',
            message: {
              text: finding.message,
            },
            locations: finding.file
              ? [
                  {
                    physicalLocation: {
                      artifactLocation: {
                        uri: finding.file,
                      },
                    },
                  },
                ]
              : undefined,
            properties: {
              category: finding.category,
              actionability: finding.actionability,
              target: finding.target,
            },
          })),
        },
      ],
    },
    null,
    2
  )}\n`;
}

export function shouldFailScan(report: ScanReport): boolean {
  return report.strict && report.summary.errorCount > 0;
}

export function toStructuredLogEvent(
  input: StructuredLogEvent
): Record<string, unknown> {
  return (redactValue({
    code: input.code,
    message: input.message,
    target: input.target,
    namespace: input.namespace,
    method: input.method,
    sourceContext: input.sourceContext,
    payload: input.payload,
    details: input.details,
  }) ?? {}) as Record<string, unknown>;
}

export function toPortablePath(baseDir: string, absolutePath: string): string {
  return path.relative(baseDir, absolutePath).replace(/\\/g, '/');
}
