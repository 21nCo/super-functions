/**
 * Depth validation for DFQL to prevent stack overflow and complexity attacks
 */

export function validateFilterDepth(
  filter: unknown,
  maxDepth: number,
  currentDepth = 0,
): boolean {
  if (currentDepth > maxDepth) {
    return false;
  }

  if (typeof filter !== "object" || filter === null) {
    return true;
  }

  // Iterate values
  for (const value of Object.values(filter)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        // e.g. $and: [ ... ]
        for (const item of value) {
          if (!validateFilterDepth(item, maxDepth, currentDepth + 1)) {
            return false;
          }
        }
      } else {
        // Nested object or operator object
        if (!validateFilterDepth(value, maxDepth, currentDepth + 1)) {
          return false;
        }
      }
    }
  }

  return true;
}

export function validateRelationDepth(
  token: string,
  maxDepth: number,
): boolean {
  // Relation depth is usually number of dots if they represent relation traversal
  // But dots can be nested object path.
  // Conservative estimate: count dots.
  const depth = token.split(".").length - 1; // "a.b" -> depth 1 (1 traversal)
  return depth <= maxDepth;
}
