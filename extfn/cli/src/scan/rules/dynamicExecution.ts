import { createScanFinding, type ScanRule } from '../report.js';

const DYNAMIC_EXECUTION_PATTERN =
  /\beval\s*\(|\bnew Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`]/;

export const dynamicExecutionRule: ScanRule = {
  id: 'SCAN-DYN-001',
  evaluate(input) {
    return input.files
      .filter((file) => DYNAMIC_EXECUTION_PATTERN.test(file.contents))
      .map((file) =>
        createScanFinding({
          ruleId: 'SCAN-DYN-001',
          severity: 'error',
          category: 'security',
          actionability: 'enforceable',
          target: input.target,
          file: file.relativePath,
          message:
            'Detected dynamic code execution that is typically rejected by extension store review.',
        })
      );
  },
};
