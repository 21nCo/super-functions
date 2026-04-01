import { createScanFinding, type ScanRule } from '../report.js';

export const permissionsRule: ScanRule = {
  id: 'SCAN-PERM-001',
  evaluate(input) {
    const hostPermissions = readStringArray(input.manifest.host_permissions);
    const permissions = readStringArray(input.manifest.permissions);
    const findings = [];

    if (
      hostPermissions.some(
        (entry) => entry === '<all_urls>' || entry === '*://*/*'
      )
    ) {
      findings.push(
        createScanFinding({
          ruleId: 'SCAN-PERM-001',
          severity: 'warning',
          category: 'permissions',
          actionability: 'enforceable',
          target: input.target,
          file: 'manifest.json',
          message:
            'Host permission scope is broad; prefer optional permissions or activeTab where possible.',
        })
      );
    }

    if (
      permissions.some((entry) =>
        ['tabs', 'webRequest', 'declarativeNetRequestWithHostAccess'].includes(entry)
      )
    ) {
      findings.push(
        createScanFinding({
          ruleId: 'SCAN-PERM-001',
          severity: 'warning',
          category: 'permissions',
          actionability: 'enforceable',
          target: input.target,
          file: 'manifest.json',
          message:
            'High-scope extension permissions are present; verify they are strictly necessary.',
          details: {
            permissions,
          },
        })
      );
    }

    return findings;
  },
};

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
