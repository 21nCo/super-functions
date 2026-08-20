import type { FieldSchema } from "@superfunctions/db";

// utf8mb4 can use four bytes per character. This conservative per-column
// ceiling stays below MySQL's 65,535-byte VARCHAR limit.
export const MYSQL_MAX_SAFE_VARCHAR_LENGTH = 16_383;
// InnoDB's modern maximum index-key size is 3,072 bytes. utf8mb4 can use four
// bytes per character, so this is the largest portable full-column key part.
export const MYSQL_MAX_SAFE_INDEXED_VARCHAR_LENGTH = 768;

export function mysqlVarcharLength(field: FieldSchema): number | null {
  if (field.maxLength === undefined) return null;
  if (
    typeof field.maxLength !== "number" ||
    !Number.isInteger(field.maxLength) ||
    field.maxLength <= 0 ||
    field.maxLength > MYSQL_MAX_SAFE_VARCHAR_LENGTH
  ) {
    throw new Error(
      `Invalid MySQL maxLength ${String(field.maxLength)}; expected an integer between 1 and ${MYSQL_MAX_SAFE_VARCHAR_LENGTH}`,
    );
  }
  return field.maxLength;
}

export function isUnboundedMySqlTextType(dataType: string): boolean {
  return /^(tinytext|text|mediumtext|longtext)$/i.test(dataType.trim());
}

export function databaseStringLength(input: {
  dataType: string;
  maxLength?: number | null;
}): number | null {
  if (typeof input.maxLength === "number" && Number.isFinite(input.maxLength)) {
    return input.maxLength;
  }
  const match = input.dataType.trim().match(/^(?:var)?char\s*\(\s*(\d+)\s*\)$/i);
  return match ? Number(match[1]) : null;
}

export function mysqlColumnTypeFromSnapshot(input: {
  dataType: string;
  columnType?: string;
  maxLength?: number | null;
}): string {
  if (input.columnType) {
    const completeType = input.columnType.trim();
    // COLUMN_TYPE is database-owned metadata, but generated migrations should
    // still refuse statement delimiters and SQL comments outside quoted ENUM
    // and SET values. Comment-looking text inside a quoted value is data.
    if (
      completeType.length === 0 ||
      hasUnsafeMySqlMetadataSyntax(completeType)
    ) {
      throw new Error(`Unsupported introspected MySQL column type: ${input.columnType}`);
    }
    return completeType;
  }
  const normalized = input.dataType.trim().toUpperCase();
  const length = databaseStringLength(input);
  if (length !== null && /^(?:VAR)?CHAR(?:\s*\(.*\))?$/i.test(input.dataType.trim())) {
    const base = input.dataType.trim().toLowerCase().startsWith("var")
      ? "VARCHAR"
      : "CHAR";
    return `${base}(${length})`;
  }
  if (!/^[A-Z][A-Z0-9_]*(?:\s*\(\s*\d+\s*\))?$/.test(normalized)) {
    throw new Error(`Unsupported introspected MySQL column type: ${input.dataType}`);
  }
  return normalized;
}

export function hasUnsafeMySqlMetadataSyntax(value: string): boolean {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === "\\") {
        // Backslash-quote meaning changes with NO_BACKSLASH_ESCAPES. Reject
        // that ambiguous metadata rather than letting either interpretation
        // move the scanner outside the literal around a statement delimiter.
        if (value[index + 1] === quote) return true;
        index += 1;
      } else if (character === quote) {
        if (value[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (
      character === ";" ||
      character === "\r" ||
      character === "\n" ||
      character === "`" ||
      character === "#" ||
      value.startsWith("--", index) ||
      value.startsWith("/*", index) ||
      value.startsWith("*/", index)
    ) {
      return true;
    }
  }
  return quote !== null;
}
