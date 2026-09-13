import { compareCodePoints, digestJson } from "./canonical.js";
import type { Finding } from "./types.js";

export function findingFingerprint(finding: Omit<Finding, "fingerprint"> | Finding): string {
  return digestJson({
    category: finding.category,
    title: finding.title.trim().toLowerCase(),
    trigger: finding.trigger.trim().toLowerCase(),
    // Commit and line coordinates belong to evidence. Prefer a symbol; otherwise use the path
    // plus the finding semantics above to tolerate unrelated line insertions.
    anchor: finding.anchor ? { path: finding.anchor.path, symbol: finding.anchor.symbol } : undefined,
    requirementIds: [...finding.requirementIds].sort(compareCodePoints),
  });
}
