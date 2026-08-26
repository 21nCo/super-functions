import { runBrowserQa } from "../uifn/examples/browser-qa/src/runner.mjs";

function compactObject(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (depth >= 3) {
    if (Array.isArray(value)) return { count: value.length };
    return { keys: Object.keys(value).slice(0, 12) };
  }
  if (Array.isArray(value)) return value.slice(0, 5).map((entry) => compactObject(entry, depth + 1));
  const compact = {};
  for (const key of [
    "ok",
    "reason",
    "route",
    "slug",
    "framework",
    "assertionType",
    "triggerCount",
    "contentCount",
    "sidecarProbeCount",
    "componentOwned",
    "valueSurface",
    "valueAfterInput",
    "clickableCount",
    "liveNetworkCalls",
    "sfCallCount",
    "actionsVisible",
    "actionFired",
    "actionResult",
    "clientType",
    "networkMeasured",
    "violationCount",
    "screenshotBytes",
    "screenshotHash",
    "nonblank",
    "baselineStatus",
    "insideViewport",
    "insideBoundary",
    "alignmentDeltaPx",
    "tolerancePx",
    "alignmentRequired",
    "escapeClosed",
    "focusRestoredAfterEscape",
    "reopenedAfterEscape",
    "outsideAttempted",
    "outsideClosed",
    "outsideShouldClose",
    "outsideBehaviorOk",
    "ariaControls",
    "ariaDescribedBy",
    "ariaExpanded",
    "contentId",
    "contentRole",
    "contentAlign",
    "controlsMatch",
    "nestedOverlay",
    "longContentScrollable",
    "mobileViewport",
    "probeConnected",
    "probeTextLength",
    "clientHeight",
    "scrollHeight",
    "overflowY",
  ]) {
    if (key in value) compact[key] = compactObject(value[key], depth + 1);
  }
  for (const key of [
    "overflow",
    "placement",
    "dismissal",
    "association",
    "form",
    "dataRich",
    "model",
    "scenario",
    "network",
    "visual",
    "clipping",
    "textOverlap",
    "themeTokens",
    "baseline",
    "longContentMetrics",
    "summary",
  ]) {
    if (key in value) compact[key] = compactObject(value[key], depth + 1);
  }
  return Object.keys(compact).length ? compact : { keys: Object.keys(value).slice(0, 12) };
}

function compactFailure(failure) {
  return {
    code: failure.code,
    message: failure.message,
    slug: failure.slug,
    framework: failure.framework,
    route: failure.route,
    qaCaseId: failure.qaCaseId,
    assertionType: failure.assertionType,
    evidence: compactObject(failure.evidence),
  };
}

const result = await runBrowserQa({
  command: "verify:uifn-browser",
  argv: process.argv.slice(2),
});

const emittedResult = process.env.UIFN_COMPACT_CHILD_EVIDENCE === "1"
  ? {
      ...result,
      checkCount: result.checks.length,
      passedChecks: result.checks.filter((check) => check.status === "passed").length,
      failedChecks: result.checks.filter((check) => check.status === "failed").length,
      failureCount: result.failures.length,
      checks: [],
      failures: result.failures.map(compactFailure),
    }
  : result;
const output = JSON.stringify(emittedResult, null, 2);
if (result.ok) {
  console.log(output);
  process.exit(0);
}

console.error(output);
process.exit(1);
