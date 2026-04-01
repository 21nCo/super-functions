import { createScanFinding, type ScanRule } from '../report.js';

export const manualReviewRule: ScanRule = {
  id: 'SCAN-MANUAL-001',
  evaluate(input) {
    return [
      createScanFinding({
        ruleId: 'SCAN-PRIVACY-001',
        severity: 'warning',
        category: 'privacy',
        actionability: 'manual-review',
        target: input.target,
        message:
          'Confirm privacy disclosures cover all collected data, network calls, and background processing.',
      }),
      createScanFinding({
        ruleId: 'SCAN-PURPOSE-001',
        severity: 'warning',
        category: 'store-readiness',
        actionability: 'manual-review',
        target: input.target,
        message:
          'Confirm the extension has a single, clear user-facing purpose that matches store listing copy.',
      }),
      createScanFinding({
        ruleId: 'SCAN-LISTING-001',
        severity: 'warning',
        category: 'store-readiness',
        actionability: 'manual-review',
        target: input.target,
        message:
          'Confirm screenshots, permission justifications, and listing metadata are complete before submission.',
      }),
    ];
  },
};
