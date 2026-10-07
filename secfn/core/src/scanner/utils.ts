import { createHash } from "node:crypto";

export function calculateEntropy(value: string): number {
  if (!value) return 0;
  const symbols = [...value];
  const counts = new Map<string, number>();
  for (const char of symbols) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / symbols.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function redactSecret(value: string): string {
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function fingerprintFinding(input: {
  ruleId: string;
  file: string;
  line: number;
  column: number;
  value: string;
}): string {
  return createHash("sha256")
    .update(`${input.ruleId}:${input.file}:${input.line}:${input.column}:${input.value}`)
    .digest("hex");
}

export function lineColumn(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

export function contextForLine(content: string, line: number, span = 2): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - span - 1);
  const end = Math.min(lines.length, line + span);
  return lines.slice(start, end).join("\n");
}
