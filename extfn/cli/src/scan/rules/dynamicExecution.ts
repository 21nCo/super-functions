import { createScanFinding, type ScanRule } from '../report.js';

const DIRECT_EVAL_PATTERN = /(?<![\w$.])eval\s*\(/;
const PARENTHESIZED_DIRECT_EVAL_PATTERN = /\(\s*eval\s*\)\s*\(/g;
const GLOBAL_DOT_EVAL_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.|\.)\s*eval\s*\(/;
const PARENTHESIZED_GLOBAL_DOT_EVAL_PATTERN =
  /\(\s*(?:window|globalThis|self)\s*\)\s*(?:\?\.|\.)\s*eval\s*\(/g;
const GLOBAL_COMPUTED_EVAL_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.)?\s*\[\s*(['"])eval\1\s*\]\s*\(/;
const PARENTHESIZED_GLOBAL_COMPUTED_EVAL_PATTERN =
  /\(\s*(?:window|globalThis|self)\s*\)\s*(?:\?\.)?\s*\[\s*(['"])eval\1\s*\]\s*\(/g;
const FUNCTION_CONSTRUCTOR_PATTERN = /(?<![\w$.])(?:new\s+)?Function\s*\(/;
const PARENTHESIZED_FUNCTION_CONSTRUCTOR_PATTERN =
  /\(\s*Function\s*\)\s*\(/g;
const STRING_TIMER_PATTERN = /\bset(?:Timeout|Interval)\s*\(\s*['"`]/;
const NON_CALLABLE_KEYWORD_PATTERN =
  /\b(?:await|case|delete|in|instanceof|new|return|throw|typeof|void|yield)$/;

const DYNAMIC_EXECUTION_PATTERNS = [
  DIRECT_EVAL_PATTERN,
  GLOBAL_DOT_EVAL_PATTERN,
  GLOBAL_COMPUTED_EVAL_PATTERN,
  FUNCTION_CONSTRUCTOR_PATTERN,
  STRING_TIMER_PATTERN,
] as const;

function containsDynamicExecution(text: string): boolean {
  const commentFreeText = removeJavaScriptComments(text);
  return (
    DYNAMIC_EXECUTION_PATTERNS.some((pattern) => pattern.test(commentFreeText)) ||
    containsUnboundParenthesizedCall(
      commentFreeText,
      PARENTHESIZED_DIRECT_EVAL_PATTERN
    ) ||
    containsUnboundParenthesizedCall(
      commentFreeText,
      PARENTHESIZED_GLOBAL_DOT_EVAL_PATTERN
    ) ||
    containsUnboundParenthesizedCall(
      commentFreeText,
      PARENTHESIZED_GLOBAL_COMPUTED_EVAL_PATTERN
    ) ||
    containsUnboundParenthesizedCall(
      commentFreeText,
      PARENTHESIZED_FUNCTION_CONSTRUCTOR_PATTERN
    )
  );
}

function containsUnboundParenthesizedCall(
  text: string,
  pattern: RegExp
): boolean {
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(0, match.index).trimEnd();
    const previousCharacter = prefix.at(-1);
    if (
      previousCharacter === undefined ||
      !/[\w$.)\]]/.test(previousCharacter) ||
      NON_CALLABLE_KEYWORD_PATTERN.test(prefix)
    ) {
      return true;
    }
  }

  return false;
}

function removeJavaScriptComments(text: string): string {
  let result = '';
  let quote: "'" | '"' | '`' | undefined;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (quote !== undefined) {
      result += character;
      if (character === '\\' && nextCharacter !== undefined) {
        result += nextCharacter;
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      result += character;
      continue;
    }

    if (character === '/' && nextCharacter === '/') {
      result += ' ';
      index += 2;
      while (index < text.length && text[index] !== '\n') {
        index += 1;
      }
      if (index < text.length) {
        result += '\n';
      }
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      result += ' ';
      index += 2;
      while (
        index < text.length &&
        !(text[index] === '*' && text[index + 1] === '/')
      ) {
        if (text[index] === '\n') {
          result += '\n';
        }
        index += 1;
      }
      index += 1;
      continue;
    }

    result += character;
  }

  return result;
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
