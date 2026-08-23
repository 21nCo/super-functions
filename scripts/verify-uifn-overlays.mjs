import { runBrowserQa } from "../uifn/examples/browser-qa/src/runner.mjs";

const result = await runBrowserQa({
  command: "verify:uifn-overlays",
  argv: ["--profile", "overlay", ...process.argv.slice(2)],
});

const emittedResult = process.env.UIFN_COMPACT_CHILD_EVIDENCE === "1"
  ? {
      ...result,
      checkCount: result.checks.length,
      passedChecks: result.checks.filter((check) => check.status === "passed").length,
      failedChecks: result.checks.filter((check) => check.status === "failed").length,
      failureCount: result.failures.length,
      checks: [],
    }
  : result;
const output = JSON.stringify(emittedResult, null, 2);
if (result.ok) {
  console.log(output);
  process.exit(0);
}

console.error(output);
process.exit(1);
