import { spawnSync } from "node:child_process";

const browserArgs = process.argv.slice(2);

function valueForArg(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === `--${name}`) return args[index + 1];
    if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3);
  }
  return undefined;
}

function hasArg(args, name) {
  return args.includes(`--${name}`) || args.some((arg) => arg.startsWith(`--${name}=`));
}

function stripArg(args, name) {
  const next = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === `--${name}`) {
      index += 1;
      continue;
    }
    if (arg.startsWith(`--${name}=`)) continue;
    next.push(arg);
  }
  return next;
}

function parseLastJson(value) {
  const source = String(value).trim();
  if (!source) return undefined;
  const starts = [];
  if (source.startsWith("{")) starts.push(0);
  for (let index = source.indexOf("\n{"); index >= 0; index = source.indexOf("\n{", index + 1)) {
    starts.push(index + 1);
  }
  for (const index of starts.reverse()) {
    try {
      return JSON.parse(source.slice(index));
    } catch {
      continue;
    }
  }
  return undefined;
}

function compactEvidence(evidence, status) {
  if (!evidence || typeof evidence !== "object") return { completed: status === 0 };
  const compact = {};
  for (const key of [
    "ok",
    "command",
    "schemaVersion",
    "mode",
    "frameworkCount",
    "componentCount",
    "patternCount",
    "sfPanelCount",
    "scenarioCount",
    "routeCount",
    "coverage",
    "summary",
    "checkCount",
    "passedChecks",
    "failedChecks",
    "failureCount",
  ]) {
    if (key in evidence) compact[key] = evidence[key];
  }
  if (Array.isArray(evidence.failures)) compact.failures = evidence.failures.slice(0, 10);
  return Object.keys(compact).length ? compact : { completed: status === 0 };
}

function run(args, id) {
  const result = spawnSync("node", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: `/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:${process.env.PATH ?? ""}`,
      UIFN_COMPACT_CHILD_EVIDENCE: "1",
    },
  });
  const parsed = parseLastJson(result.stdout) ?? parseLastJson(result.stderr);
  return {
    id,
    status: result.status ?? 1,
    ok: result.status === 0,
    evidence: compactEvidence(parsed, result.status),
    stdoutTail: result.stdout.trim().split("\n").slice(-8),
    stderrTail: result.stderr.trim().split("\n").slice(-8),
  };
}

function runBrowserShardSet(args) {
  const shardCount = Number(valueForArg(args, "shard-count"));
  const shouldAggregate =
    Number.isFinite(shardCount) &&
    shardCount > 1 &&
    !hasArg(args, "shard-index") &&
    !hasArg(args, "list-shards");

  if (!shouldAggregate) {
    return run(["scripts/verify-uifn-browser.mjs", ...args], "browser");
  }

  const baseArgs = stripArg(args, "shard-index");
  const shardChecks = [];
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    shardChecks.push(run(["scripts/verify-uifn-browser.mjs", ...baseArgs, "--shard-index", String(shardIndex)], `browser-shard:${shardIndex}`));
  }

  const missingShards = [];
  const failedShards = [];
  const truncatedShards = [];
  const indexes = new Set();
  let checkCount = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let routeCount = 0;
  const failures = [];

  for (const shard of shardChecks) {
    const evidence = shard.evidence ?? {};
    const index = evidence.coverage?.shard?.index;
    if (Number.isFinite(index)) indexes.add(index);
    if (!shard.ok) failedShards.push(shard.id);
    if (evidence.coverage?.routes?.truncatedByMaxRoutes || evidence.coverage?.shard?.truncatedByMaxRoutes) {
      truncatedShards.push(shard.id);
    }
    checkCount += Number(evidence.checkCount ?? evidence.summary?.checkCount ?? 0);
    passedChecks += Number(evidence.passedChecks ?? evidence.summary?.passed ?? 0);
    failedChecks += Number(evidence.failedChecks ?? evidence.summary?.failed ?? 0);
    routeCount += Number(evidence.routeCount ?? 0);
    failures.push(...(Array.isArray(evidence.failures) ? evidence.failures : []));
  }

  for (let index = 0; index < shardCount; index += 1) {
    if (!indexes.has(index)) missingShards.push(index);
  }

  const ok = failedShards.length === 0 && missingShards.length === 0 && truncatedShards.length === 0;
  return {
    id: "browser",
    status: ok ? 0 : 1,
    ok,
    evidence: {
      ok,
      command: "verify:uifn-browser",
      schemaVersion: 1,
      mode: "sharded",
      routeCount,
      checkCount,
      passedChecks,
      failedChecks,
      failureCount: failures.length,
      coverage: {
        shardAggregation: {
          enabled: true,
          count: shardCount,
          completed: shardChecks.length,
          missingShards,
          failedShards,
          truncatedShards,
        },
        shards: shardChecks.map((shard) => ({
          id: shard.id,
          ok: shard.ok,
          routeCount: shard.evidence?.routeCount,
          checkCount: shard.evidence?.checkCount ?? shard.evidence?.summary?.checkCount,
          coverage: shard.evidence?.coverage,
        })),
      },
      summary: {
        totalShards: shardCount,
        passedShards: shardChecks.filter((shard) => shard.ok).length,
        failedShards: failedShards.length,
        missingShards: missingShards.length,
        truncatedShards: truncatedShards.length,
        checkCount,
        passed: passedChecks,
        failed: failedChecks,
      },
      failures: [
        ...failures,
        ...missingShards.map((index) => ({ code: "UIFN_WORKBENCH_SHARD_MISSING", shardIndex: index })),
        ...truncatedShards.map((id) => ({ code: "UIFN_WORKBENCH_SHARD_TRUNCATED", id })),
      ].slice(0, 20),
    },
    stdoutTail: [],
    stderrTail: shardChecks.flatMap((shard) => shard.stderrTail ?? []).slice(-8),
  };
}

const checks = [
  run(["scripts/verify-uifn-examples.mjs"], "examples"),
  runBrowserShardSet(browserArgs),
];
const ok = checks.every((check) => check.ok);
const output = {
  ok,
  command: "verify:uifn-workbench",
  schemaVersion: 1,
  mode: "full",
  checks,
  failures: checks
    .filter((check) => !check.ok)
    .map((check) => ({ code: "UIFN_WORKBENCH_GATE_FAILED", id: check.id, evidence: check.evidence })),
  summary: {
    total: checks.length,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok).length,
  },
  coverage: {
    staticExamples: checks.find((check) => check.id === "examples")?.evidence?.coverage,
    browser: checks.find((check) => check.id === "browser")?.evidence?.coverage,
  },
  artifacts: [],
};

if (ok) {
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

console.error(JSON.stringify(output, null, 2));
process.exit(1);
