/** A Graph cursor may add opaque query parameters, never select a new account/resource. */
export function graphPageUrl(expected: string, nextLink?: string): string {
  if (!nextLink) return expected;
  const cursor = new URL(nextLink);
  const base = new URL(expected);
  if (
    cursor.origin !== "https://graph.microsoft.com" ||
    cursor.origin !== base.origin ||
    cursor.pathname !== base.pathname ||
    cursor.username ||
    cursor.password ||
    cursor.hash
  )
    throw new Error("GRAPH_CURSOR_RESOURCE_MISMATCH");
  return cursor.toString();
}
