import { compareCodePoints, digestJson } from "./canonical.js";
import type { Finding } from "./types.js";

export function findingFingerprint(finding: Omit<Finding, "fingerprint"> | Finding): string {
  return digestJson({
    category: finding.category,
    title: finding.title.trim().toLowerCase(),
    trigger: finding.trigger.trim().toLowerCase(),
    // Commit identity belongs to evidence; fingerprints correlate unchanged locations across revisions.
    anchor: finding.anchor ? { path: finding.anchor.path, startLine: finding.anchor.startLine, endLine: finding.anchor.endLine, symbol: finding.anchor.symbol } : undefined,
    requirementIds: [...finding.requirementIds].sort(compareCodePoints),
  });
}
