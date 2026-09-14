/** Shared equal-score ordering, applied before engine truncation and in the UI. */
export function compareSearchIdentity(left: { title: string; path: string; id: string }, right: { title: string; path: string; id: string }): number {
  for (const key of ["title", "path", "id"] as const) {
    const order = left[key].localeCompare(right[key], "en", { sensitivity: "variant", numeric: true });
    if (order) return order;
  }
  return 0;
}
