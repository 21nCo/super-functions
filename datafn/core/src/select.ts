export interface SelectToken {
  path: string[];
  baseName: string;
  directive: string | undefined;
}

/**
 * Parse a DFQL select token string into its structured components.
 * Examples: "id" → {path:["id"], baseName:"id", directive:undefined}
 *           "tags.*" → {path:["tags","*"], baseName:"tags", directive:"*"}
 *           "tasks.tags.*" → {path:["tasks","tags","*"], baseName:"tasks", directive:"tags.*"}
 */
export function parseSelectToken(token: string): SelectToken {
  const parts = token.split(".");
  const baseName = parts[0];
  const directive = parts.length > 1 ? parts.slice(1).join(".") : undefined;

  return { path: parts, baseName, directive };
}
