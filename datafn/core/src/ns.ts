/**
 * Composable namespace helper.
 *
 * Joins non-empty string segments with `:` to form a namespace string.
 *
 * @example
 * ns("org-acme", "user-123")    // => "org-acme:user-123"
 * ns("user-1")                  // => "user-1"
 * ns("org", "project", "user")  // => "org:project:user"
 * ns("org", "", "user")         // => "org:user" (empty filtered)
 * ns()                          // throws Error
 */
export function ns(...segments: string[]): string {
  const filtered = segments.filter((s) => s != null && s !== "");
  if (filtered.length === 0) {
    throw new Error("ns() requires at least one non-empty segment");
  }
  return filtered.join(":");
}
