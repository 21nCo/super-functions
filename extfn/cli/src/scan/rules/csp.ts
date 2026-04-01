import { createScanFinding, type ScanRule } from '../report.js';

export const cspRule: ScanRule = {
  id: 'SCAN-CSP-001',
  evaluate(input) {
    const csp = readContentSecurityPolicy(input.manifest);
    if (!csp) {
      return [];
    }

    const lowered = csp.toLowerCase();
    if (
      lowered.includes("'unsafe-eval'") ||
      lowered.includes("'unsafe-inline'") ||
      lowered.includes('http://')
    ) {
      return [
        createScanFinding({
          ruleId: 'SCAN-CSP-001',
          severity: 'error',
          category: 'security',
          actionability: 'enforceable',
          target: input.target,
          file: 'manifest.json',
          message:
            'Content security policy includes unsafe directives or insecure remote origins.',
          details: {
            policy: csp,
          },
        }),
      ];
    }

    return [];
  },
};

function readContentSecurityPolicy(manifest: Record<string, unknown>): string | undefined {
  const value = manifest.content_security_policy;
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object') {
    const extensionPages = (value as Record<string, unknown>).extension_pages;
    return typeof extensionPages === 'string' ? extensionPages : undefined;
  }

  return undefined;
}
