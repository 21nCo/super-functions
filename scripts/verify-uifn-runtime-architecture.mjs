#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const coreRoot = resolve(repoRoot, 'uifn/core');

function collectFiles(directory, predicate, result = {}) {
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory).sort()) {
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) collectFiles(absolute, predicate, result);
    else if (predicate(absolute)) result[relative(repoRoot, absolute).replaceAll('\\', '/')] = readFileSync(absolute, 'utf8');
  }
  return result;
}

export function loadRuntimeArchitectureInput({ requireDist = false } = {}) {
  const sourceFiles = collectFiles(resolve(coreRoot, 'src'), (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
  const declarationFiles = collectFiles(resolve(coreRoot, 'dist'), (file) => file.endsWith('.d.ts') || file.endsWith('.d.mts'));
  const bundleFiles = collectFiles(resolve(coreRoot, 'dist'), (file) => file.endsWith('.js') || file.endsWith('.mjs'));
  return {
    sourceFiles,
    declarationFiles,
    bundleFiles,
    packageJson: JSON.parse(readFileSync(resolve(coreRoot, 'package.json'), 'utf8')),
    tsupConfig: readFileSync(resolve(coreRoot, 'tsup.config.ts'), 'utf8'),
    requireDist,
  };
}

function issue(code, message, path) {
  return Object.freeze({ code, message, path });
}

export function inspectRuntimeArchitecture(input) {
  const issues = [];
  const entries = Object.entries(input.sourceFiles);
  const constructorDefinitions = entries.filter(([, source]) => /\bfunction\s+createRuntimeService\s*</.test(source));
  if (constructorDefinitions.length !== 1 || constructorDefinitions[0]?.[0] !== 'uifn/core/src/internal/runtime/service.ts') {
    issues.push(issue(
      'UIFN_MULTIPLE_BEHAVIOR_RUNTIME',
      'Exactly one createRuntimeService constructor must exist at the private canonical path.',
      constructorDefinitions.map(([path]) => path).join(',') || 'missing',
    ));
  }

  const behaviorFiles = entries.filter(([path]) => (
    (path.startsWith('uifn/core/src/primitives/') && !path.endsWith('/controllers.ts')) ||
    path === 'uifn/core/src/utils/presence.ts'
  ));
  const bypassPatterns = [
    { pattern: /\b(?:let|var)\s+(?:state|context|open|currentValue)\b/, label: 'primitive-local mutable state' },
    { pattern: /\b(?:listeners|subscriptions)\s*=\s*new\s+Set\b/, label: 'primitive-local subscriber registry' },
    { pattern: /(?<![.\w])(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/, label: 'ambient scheduler call' },
    { pattern: /\b(?:queue|eventQueue)\s*=\s*\[/, label: 'primitive-local event queue' },
  ];
  for (const [path, source] of behaviorFiles) {
    for (const { pattern, label } of bypassPatterns) {
      if (pattern.test(source)) issues.push(issue('UIFN_MULTIPLE_BEHAVIOR_RUNTIME', `${label} bypasses the private runtime.`, path));
    }
  }

  const requiredFunnels = {
    'uifn/core/src/internal/runtime/state-channel.ts': 'createRuntimeService',
    'uifn/core/src/primitives/status-feedback-controllers.ts': 'createStateChannel',
    'uifn/core/src/internal/runtime/controlled.ts': 'createRuntimeService',
    'uifn/core/src/utils/presence.ts': 'createRuntimeService',
  };
  for (const [path, symbol] of Object.entries(requiredFunnels)) {
    if (!input.sourceFiles[path]?.includes(symbol)) {
      issues.push(issue('UIFN_MULTIPLE_BEHAVIOR_RUNTIME', `Required behavior funnel does not use ${symbol}.`, path));
    }
  }

  const publicSource = entries.filter(([path]) => (
    path === 'uifn/core/src/index.ts' ||
    path === 'uifn/core/src/primitives/index.ts'
  ));
  for (const [path, source] of publicSource) {
    if (/internal\/runtime|createRuntimeService|RuntimeService|RuntimeDefinition/.test(source)) {
      issues.push(issue('UIFN_PRIVATE_RUNTIME_EXPORTED', 'A public source entry exposes a private runtime symbol or path.', path));
    }
  }
  for (const exportPath of Object.keys(input.packageJson.exports ?? {})) {
    if (exportPath.includes('internal') || exportPath.includes('runtime')) {
      issues.push(issue('UIFN_PRIVATE_RUNTIME_EXPORTED', 'Package exports expose the private runtime.', exportPath));
    }
  }
  if (/src\/internal|internal\/runtime/.test(input.tsupConfig)) {
    issues.push(issue('UIFN_PRIVATE_RUNTIME_EXPORTED', 'Build entries expose the private runtime.', 'uifn/core/tsup.config.ts'));
  }
  if (input.requireDist && Object.keys(input.declarationFiles).length === 0) {
    issues.push(issue('UIFN_PRIVATE_RUNTIME_EXPORTED', 'Packed declaration privacy cannot be proven because dist declarations are absent.', 'uifn/core/dist'));
  }
  for (const [path, declaration] of Object.entries(input.declarationFiles)) {
    if (path.includes('/internal/') || /from\s+['"][^'"]*internal\/runtime|\bcreateRuntimeService\b|\bRuntime[A-Z][A-Za-z]+\b/.test(declaration)) {
      issues.push(issue('UIFN_PRIVATE_RUNTIME_EXPORTED', 'A packed declaration leaks the private runtime.', path));
    }
  }
  if (input.requireDist) {
    for (const [path, bundle] of Object.entries(input.bundleFiles ?? {})) {
      if (/kind:\s*["']transaction["']|listener-error|eventKeys:\s*Object\.keys|\[REDACTED\]/.test(bundle)) {
        issues.push(issue('UIFN_TRACE_SECRET', 'Production bundle retained development trace-record construction.', path));
      }
    }
  }

  const dependencies = {
    ...(input.packageJson.dependencies ?? {}),
    ...(input.packageJson.peerDependencies ?? {}),
  };
  for (const dependency of Object.keys(dependencies)) {
    if (/^(?:react|react-dom|svelte|solid-js|@uifn\/dom)/.test(dependency)) {
      issues.push(issue('UIFN_MULTIPLE_BEHAVIOR_RUNTIME', 'Core private runtime has a framework or DOM dependency.', dependency));
    }
  }
  return Object.freeze(issues);
}

export function classifyRuntimeMutations(mutations) {
  const codes = [];
  if (mutations.recursiveDispatch) codes.push('UIFN_EVENT_ORDER_DIVERGED');
  if (mutations.suppressSameStatePublication) codes.push('UIFN_SNAPSHOT_CHANGE_NOT_PUBLISHED');
  if (mutations.snapshotContainsRef) codes.push('UIFN_SNAPSHOT_NON_SERIALIZABLE');
  if (mutations.sharedScopeCounter) codes.push('UIFN_SCOPE_ID_COLLISION');
  if (mutations.effectWithoutCleanup) codes.push('UIFN_EFFECT_CLEANUP_MISSING');
  if (mutations.staleEffectCanMutate) codes.push('UIFN_STALE_EFFECT_MUTATION');
  if (mutations.unknownChangeMeta) codes.push('UIFN_CHANGE_META_INVALID');
  if (mutations.rawErrorEscapes) codes.push('UIFN_UNSTABLE_ERROR');
  if (mutations.traceContainsSecret) codes.push('UIFN_TRACE_SECRET');
  return Object.freeze(codes);
}

export function verifyRuntimeArchitecture(options = {}) {
  const issues = inspectRuntimeArchitecture(loadRuntimeArchitectureInput(options));
  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-runtime-architecture',
    requirements: ['ARCH-001', 'CORE-001', 'CORE-002', 'CORE-003', 'CORE-004'],
    vectors: [
      'TV-ARCH-001-P', 'TV-ARCH-001-N',
      'TV-CORE-001-P', 'TV-CORE-001-N', 'TV-CORE-002-P', 'TV-CORE-002-N',
      'TV-CORE-003-P', 'TV-CORE-003-N', 'TV-CORE-004-P', 'TV-CORE-004-N',
    ],
    constructor: 'uifn/core/src/internal/runtime/service.ts#createRuntimeService',
    declarationFiles: Object.keys(loadRuntimeArchitectureInput(options).declarationFiles).length,
    productionTracePayloads: issues.filter((entry) => entry.message.includes('trace-record')).length,
    issues,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyRuntimeArchitecture({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
