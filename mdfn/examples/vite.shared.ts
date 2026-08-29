export function mdfnExampleManualChunks(id: string): string | undefined {
  if (id.includes("/node_modules/@codemirror/")) return "codemirror";
  if (id.includes("/node_modules/@lezer/")) return "lezer";
  if (id.includes("/node_modules/prosemirror-")) return "prosemirror";
  if (id.includes("/uifn/")) return "uifn";
  if (
    id.includes("/node_modules/micromark")
    || id.includes("/node_modules/mdast-util-")
    || id.includes("/node_modules/remark-")
    || id.includes("/node_modules/unified/")
    || id.includes("/node_modules/unist-util-")
    || id.includes("/node_modules/vfile")
    || id.includes("/node_modules/decode-named-character-reference/")
    || id.includes("/node_modules/character-entities")
  ) return "markdown";
  return undefined;
}
