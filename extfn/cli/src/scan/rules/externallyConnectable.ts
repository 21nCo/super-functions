import { createScanFinding, type ScanRule } from '../report.js';

export const externallyConnectableRule: ScanRule = {
  id: 'SCAN-EXT-001',
  evaluate(input) {
    const externallyConnectable = input.manifest.externally_connectable;
    if (!externallyConnectable || typeof externallyConnectable !== 'object') {
      return [];
    }

    return [
      createScanFinding({
        ruleId: 'SCAN-EXT-001',
        severity: 'warning',
        category: 'security',
        actionability: 'enforceable',
        target: input.target,
        file: 'manifest.json',
        message:
          'externally_connectable is configured; confirm the exposed origins and message surfaces are narrowly scoped.',
      }),
    ];
  },
};
