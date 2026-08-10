import { createScanFinding, type ScanRule } from '../report.js';

const DIRECT_EVAL_PATTERN = /(?<![\w$.])eval(?:\s*\))*\s*\(/;
const GLOBAL_DOT_EVAL_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)(?:\s*\))*\s*(?:\?\.|\.)\s*eval\s*\(/;
const GLOBAL_COMPUTED_EVAL_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)(?:\s*\))*\s*(?:\?\.)?\s*\[\s*(['"])eval\1\s*\]\s*\(/;
const FUNCTION_CONSTRUCTOR_PATTERN = /\bnew Function\s*\(/;
const STRING_TIMER_PATTERN = /\bset(?:Timeout|Interval)\s*\(\s*['"`]/;

const DYNAMIC_EXECUTION_PATTERNS = [
  DIRECT_EVAL_PATTERN,
  GLOBAL_DOT_EVAL_PATTERN,
  GLOBAL_COMPUTED_EVAL_PATTERN,
  FUNCTION_CONSTRUCTOR_PATTERN,
  STRING_TIMER_PATTERN,
] as const;

function containsDynamicExecution(text: string): boolean {
  return DYNAMIC_EXECUTION_PATTERNS.some((pattern) => pattern.test(text));
}

export const dynamicExecutionRule: ScanRule = {
  id: 'SCAN-DYN-001',
  evaluate(input) {
    return input.files
      .filter((file) => containsDynamicExecution(file.contents))
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
