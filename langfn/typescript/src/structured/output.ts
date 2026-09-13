import { SchemaValidationError } from "../core/errors.js";

export interface SchemaLike<T> {
  parse(data: unknown): T;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
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
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

export class StructuredOutput<T> {
  constructor(private readonly schema: SchemaLike<T>) {}

  parse(text: string): T {
    const candidate = extractFirstJsonObject(text);
    if (!candidate) {
      throw new SchemaValidationError("No JSON object found in output", {
        metadata: {
          text,
          errors: [{ message: "No JSON object found" }]
        }
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (error) {
      const candidateError = error as Error & { lineNumber?: number; columnNumber?: number };
      throw new SchemaValidationError("Invalid JSON in model output", {
        metadata: {
          text: candidate,
          errors: [
            {
              message: candidateError.message,
              line: candidateError.lineNumber,
              column: candidateError.columnNumber
            }
          ]
        },
        cause: error
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
