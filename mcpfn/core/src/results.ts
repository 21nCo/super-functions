import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import { jsonSafe } from "./errors.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function structuredResult(
  structuredContent: Record<string, unknown>,
  content?: ContentBlock[],
): CallToolResult {
  const normalized = jsonSafe(structuredContent) as Record<string, unknown>;
  return {
    content: content ?? [
      { type: "text", text: JSON.stringify(normalized, null, 2) },
    ],
    structuredContent: normalized,
  };
}
