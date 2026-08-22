import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function jsonSafe(value: unknown): unknown {
  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (_key, entry: unknown) => {
      if (typeof entry === "bigint") return entry.toString();
      if (entry && typeof entry === "object") {
        if (seen.has(entry)) return "[Circular]";
        seen.add(entry);
      }
      return entry;
    });
    return serialized === undefined ? String(value) : JSON.parse(serialized) as unknown;
  } catch {
    return "[Unserializable]";
  }
}

export class McpFnError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "McpFnError";
    this.code = code;
    this.details = details;
  }
}

export class McpFnValidationError extends McpFnError {
  constructor(message: string, details?: unknown) {
    super("MCPFN_INVALID_ARGUMENTS", message, details);
    this.name = "McpFnValidationError";
  }
}

export class McpFnOutputValidationError extends McpFnError {
  constructor(message: string, details?: unknown) {
    super("MCPFN_INVALID_OUTPUT", message, details);
    this.name = "McpFnOutputValidationError";
  }
}

export function errorResult(
  error: unknown,
  options: { includeStructuredContent?: boolean } = {},
): CallToolResult {
  const normalized =
    error instanceof McpFnError
      ? { code: error.code, message: error.message, details: error.details }
      : error instanceof Error && "code" in error && typeof error.code === "string"
        ? {
            code: error.code,
            message: error.message,
            details:
              "details" in error
                ? error.details
                : "metadata" in error
                  ? error.metadata
                  : undefined,
          }
      : error && typeof error === "object" &&
          "code" in error && typeof error.code === "string" &&
          "message" in error && typeof error.message === "string"
        ? {
            code: error.code,
            message: error.message,
            details:
              "details" in error
                ? error.details
                : "metadata" in error
                  ? error.metadata
                  : undefined,
          }
      : {
          code: "MCPFN_TOOL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        };
  const structuredContent = {
    ok: false,
    error: Object.fromEntries(
      Object.entries(normalized)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, key === "details" ? jsonSafe(value) : value]),
    ),
  } as { ok: false; error: Record<string, unknown> };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    ...(options.includeStructuredContent === false ? {} : { structuredContent }),
    isError: true,
  };
}
