import { SchemaValidationError } from "../core/errors.js";

export interface SchemaLike<T> {
  parse(data: unknown): T;
}

function extractJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    }
    if (char === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

export class StructuredOutput<T> {
  constructor(private readonly schema: SchemaLike<T>) {}

  parse(text: string): T {
    const candidates = extractJsonObjects(text);
    if (!candidates.length) {
      throw new SchemaValidationError("No JSON object found in output", {
        metadata: {
          text,
          errors: [{ message: "No JSON object found" }]
        }
      });
    }

    let candidate: string | undefined;
    let parsed: unknown;
    let parseError: unknown;
    for (const next of candidates) {
      try {
        parsed = JSON.parse(next);
        candidate = next;
        break;
      } catch (error) {
        parseError = error;
      }
    }
    if (candidate === undefined) {
      const candidateError = parseError as Error & { lineNumber?: number; columnNumber?: number };
      throw new SchemaValidationError("Invalid JSON in model output", {
        metadata: {
          text,
          errors: [
            {
              message: candidateError?.message ?? "Invalid JSON",
              line: candidateError.lineNumber,
              column: candidateError.columnNumber
            }
          ]
        },
        cause: parseError
      });
    }

    try {
      return this.schema.parse(parsed);
    } catch (error) {
      const details = extractIssues(error);
      throw new SchemaValidationError("Output does not match schema", {
        metadata: {
          text: candidate,
          errors: details
        },
        cause: error
      });
    }
  }

  getSchema(): SchemaLike<T> {
    return this.schema;
  }
}

function extractIssues(error: unknown): Array<Record<string, unknown>> {
  if (typeof error === "object" && error && "issues" in error && Array.isArray((error as any).issues)) {
    return (error as any).issues as Array<Record<string, unknown>>;
  }
  if (typeof error === "object" && error && "errors" in error && Array.isArray((error as any).errors)) {
    return (error as any).errors as Array<Record<string, unknown>>;
  }
  if (error instanceof Error) {
    return [{ message: error.message }];
  }
  return [{ message: String(error) }];
}
