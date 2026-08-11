import { createScanFinding, type ScanRule } from '../report.js';

const DIRECT_EVAL_PATTERN = /(?<![\w$.])eval\s*\(/;
const PARENTHESIZED_DIRECT_EVAL_PATTERN = /\(\s*eval\s*\)\s*\(/g;
const GLOBAL_DOT_EVAL_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.|\.)\s*eval\s*\(/;
const PARENTHESIZED_GLOBAL_DOT_EVAL_PATTERN =
  /(?:\(\s*)+(?:window|globalThis|self)(?:\s*\))+\s*(?:\?\.|\.)\s*eval\s*\(/g;
const GLOBAL_COMPUTED_EVAL_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.\s*)?\[\s*(['"`])eval\1\s*\]\s*\(/;
const PARENTHESIZED_GLOBAL_COMPUTED_EVAL_PATTERN =
  /(?:\(\s*)+(?:window|globalThis|self)(?:\s*\))+\s*(?:\?\.\s*)?\[\s*(['"`])eval\1\s*\]\s*\(/g;
const FUNCTION_CONSTRUCTOR_PATTERN = /(?<![\w$.])(?:new\s+)?Function\s*\(/;
const PARENTHESIZED_FUNCTION_CONSTRUCTOR_PATTERN =
  /\(\s*Function\s*\)\s*\(/g;
const GLOBAL_DOT_FUNCTION_CONSTRUCTOR_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.|\.)\s*Function\s*\(/;
const PARENTHESIZED_GLOBAL_DOT_FUNCTION_CONSTRUCTOR_PATTERN =
  /(?:\(\s*)+(?:window|globalThis|self)(?:\s*\))+\s*(?:\?\.|\.)\s*Function\s*\(/g;
const GLOBAL_COMPUTED_FUNCTION_CONSTRUCTOR_PATTERN =
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.\s*)?\[\s*(['"`])Function\1\s*\]\s*\(/;
const PARENTHESIZED_GLOBAL_COMPUTED_FUNCTION_CONSTRUCTOR_PATTERN =
  /(?:\(\s*)+(?:window|globalThis|self)(?:\s*\))+\s*(?:\?\.\s*)?\[\s*(['"`])Function\1\s*\]\s*\(/g;
const STRING_TIMER_PATTERN = /\bset(?:Timeout|Interval)\s*\(\s*['"`]/;
const NON_CALLABLE_KEYWORD_PATTERN =
  /\b(?:await|case|delete|do|else|in|instanceof|new|return|throw|typeof|void|yield)$/;
const CONTROL_FLOW_KEYWORD_PATTERN = /\b(?:for|if|while|with)$/;
const REGEX_PREFIX_KEYWORD_PATTERN =
  /\b(?:await|case|delete|do|else|in|instanceof|new|return|throw|typeof|void|yield)$/;

const DYNAMIC_EXECUTION_PATTERNS = [
  DIRECT_EVAL_PATTERN,
  GLOBAL_DOT_EVAL_PATTERN,
  GLOBAL_COMPUTED_EVAL_PATTERN,
  FUNCTION_CONSTRUCTOR_PATTERN,
  GLOBAL_DOT_FUNCTION_CONSTRUCTOR_PATTERN,
  GLOBAL_COMPUTED_FUNCTION_CONSTRUCTOR_PATTERN,
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
    ) ||
    containsUnboundParenthesizedCall(
      commentFreeText,
      PARENTHESIZED_GLOBAL_DOT_FUNCTION_CONSTRUCTOR_PATTERN
    ) ||
    containsUnboundParenthesizedCall(
      commentFreeText,
      PARENTHESIZED_GLOBAL_COMPUTED_FUNCTION_CONSTRUCTOR_PATTERN
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
      NON_CALLABLE_KEYWORD_PATTERN.test(prefix) ||
      endsWithControlFlowCondition(prefix)
    ) {
      return true;
    }
  }

  return false;
}

function endsWithControlFlowCondition(prefix: string): boolean {
  if (!prefix.endsWith(')')) {
    return false;
  }

  const openingParenthesis = findOpeningParenthesis(prefix);
  return (
    openingParenthesis !== -1 &&
    CONTROL_FLOW_KEYWORD_PATTERN.test(
      prefix.slice(0, openingParenthesis).trimEnd()
    )
  );
}

function findOpeningParenthesis(text: string): number {
  let depth = 0;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text[index] === ')') {
      depth += 1;
    } else if (text[index] === '(') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function removeJavaScriptComments(text: string): string {
  const chunks: string[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (isQuote(character)) {
      const quotedText = readQuotedText(text, index, character);
      chunks.push(quotedText.value);
      index = quotedText.endIndex + 1;
    } else if (text.startsWith('//', index)) {
      chunks.push('\n');
      index = skipLineComment(text, index) + 1;
    } else if (text.startsWith('/*', index)) {
      chunks.push(' ');
      index = skipBlockComment(text, index) + 1;
    } else if (character === '/' && isRegexLiteralStart(text, index)) {
      const regexLiteral = readRegexLiteral(text, index);
      chunks.push(regexLiteral.value);
      index = regexLiteral.endIndex + 1;
    } else {
      chunks.push(character);
      index += 1;
    }
  }

  return chunks.join('');
}

function isQuote(character: string): character is "'" | '"' | '`' {
  return character === "'" || character === '"' || character === '`';
}

function readQuotedText(
  text: string,
  startIndex: number,
  quote: "'" | '"' | '`'
): { value: string; endIndex: number } {
  for (let index = startIndex + 1; index < text.length; index += 1) {
    if (text[index] === '\\') {
      index += 1;
    } else if (text[index] === quote) {
      return {
        value: text.slice(startIndex, index + 1),
        endIndex: index,
      };
    }
  }

  return {
    value: text.slice(startIndex),
    endIndex: text.length - 1,
  };
}

function skipLineComment(text: string, startIndex: number): number {
  const newlineIndex = text.indexOf('\n', startIndex + 2);
  return newlineIndex === -1 ? text.length - 1 : newlineIndex;
}

function skipBlockComment(text: string, startIndex: number): number {
  const closingIndex = text.indexOf('*/', startIndex + 2);
  return closingIndex === -1 ? text.length - 1 : closingIndex + 1;
}

function isRegexLiteralStart(text: string, startIndex: number): boolean {
  const prefix = text.slice(0, startIndex).trimEnd();
  const previousCharacter = prefix.at(-1);
  return (
    previousCharacter === undefined ||
    /[[({=,:;!?&|+*%^~<>-]/.test(previousCharacter) ||
    REGEX_PREFIX_KEYWORD_PATTERN.test(prefix) ||
    endsWithControlFlowCondition(prefix)
  );
}

function readRegexLiteral(
  text: string,
  startIndex: number
): { value: string; endIndex: number } {
  let insideCharacterClass = false;
  let index = startIndex + 1;
  while (index < text.length) {
    const character = text[index];
    if (character === '\\') {
      index += 2;
      continue;
    } else if (character === '[') {
      insideCharacterClass = true;
    } else if (character === ']') {
      insideCharacterClass = false;
    } else if (character === '/' && !insideCharacterClass) {
      let endIndex = index;
      while (/[A-Za-z]/.test(text[endIndex + 1] ?? '')) {
        endIndex += 1;
      }
      return {
        value: text.slice(startIndex, endIndex + 1),
        endIndex,
      };
    }

    index += 1;
  }

  return { value: '/', endIndex: startIndex };
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
