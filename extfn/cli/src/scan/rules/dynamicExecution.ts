import { createScanFinding, type ScanRule } from '../report.js';

// Guard the direct `eval(` match against member access so methods such as
// `sourceMap.eval(` are not flagged, while still detecting explicit access
// through browser global objects.
const DYNAMIC_EXECUTION_PATTERN =
  /(?<![\w$.])eval\s*\(|(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.|\.)\s*eval\s*\(|\bnew Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`]/;

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
