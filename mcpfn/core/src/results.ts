import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import { jsonSafe, McpFnOutputValidationError } from "./errors.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function structuredResult(
  structuredContent: Record<string, unknown>,
  content?: ContentBlock[],
): CallToolResult {
  const normalized = jsonSafe(structuredContent);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new McpFnOutputValidationError(
      "structuredContent must serialize to an object",
    );
  }
  return {
    content: content ?? [
      { type: "text", text: JSON.stringify(normalized, null, 2) },
    ],
    structuredContent: normalized as Record<string, unknown>,
  };
}
