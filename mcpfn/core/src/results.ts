import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function structuredResult(
  structuredContent: Record<string, unknown>,
  content?: ContentBlock[],
): CallToolResult {
  return {
    content: content ?? [
      { type: "text", text: JSON.stringify(structuredContent, null, 2) },
    ],
    structuredContent,
  };
}
