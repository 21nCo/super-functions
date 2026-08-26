import { createHash } from 'node:crypto';
import { compareSemanticTraces } from '../uifn/adapter-kit/dist/index.mjs';

export const PHASE_18_LEDGER_REVISION = 'uifn-a11y-ledger-v1';
export const PHASE_18_RULES = Object.freeze([
  'normative-semantics',
  'accessible-name',
  'description',
  'role-state',
  'keyboard',
  'focus',
  'pointer-touch',
  'form',
  'announcement',
  'forced-colors',
  'reduced-motion',
  'rtl-bidi',
  'zoom-reflow',
]);

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function expandPhase14ConsensusTraces(document) {
  const frameworks = document?.frameworks;
  const traces = document?.traces;
  if (!Array.isArray(frameworks) || !Array.isArray(traces)) {
    throw new Error('UIFN_PHASE18_TRACE_CONSENSUS_INVALID');
  }
  return traces.flatMap((trace) => frameworks.map((framework) => ({
    ...structuredClone(trace),
    framework,
  })));
}

export function normalizeSemanticParts(trace) {
  const checkpoints = trace?.parts ?? [];
  const byKey = new Map();
  for (const checkpoint of checkpoints) {
    for (const part of checkpoint.parts ?? []) {
      const key = `${part.part}:${part.instance ?? 'root'}`;
      const record = byKey.get(key) ?? {
        part: part.part,
        instance: part.instance ?? 'root',
        tags: new Set(),
        roles: new Set(),
        aria: new Set(),
        data: new Set(),
        attributes: new Set(),
      };
      if (part.tag) record.tags.add(part.tag);
      if (part.role) record.roles.add(part.role);
      for (const name of Object.keys(part.aria ?? {})) record.aria.add(name);
      for (const name of Object.keys(part.data ?? {})) record.data.add(name);
      for (const name of Object.keys(part.attributes ?? {})) record.attributes.add(name);
      byKey.set(key, record);
    }
  }
  return [...byKey.values()]
    .map((record) => ({
      part: record.part,
      instance: record.instance,
      tags: [...record.tags].sort(),
      roles: [...record.roles].sort(),
      aria: [...record.aria].sort(),
      data: [...record.data].sort(),
      attributes: [...record.attributes].sort(),
    }))
    .sort((left, right) => `${left.part}:${left.instance}`.localeCompare(`${right.part}:${right.instance}`));
}

export function validateLedger(ledger, catalog, { now = new Date() } = {}) {
  const failures = [];
  const primitiveById = new Map((catalog?.primitives ?? []).map((primitive) => [primitive.id, primitive]));
  if (ledger?.revision !== PHASE_18_LEDGER_REVISION) failures.push({ code: 'UIFN_A11Y_LEDGER_STALE', reason: 'revision' });
  if (ledger?.review?.status !== 'reviewed' || ledger?.review?.owner !== 'uifn-maintainer') {
    failures.push({ code: 'UIFN_A11Y_REVIEW_MISSING', reason: 'owner-review' });
  }
  const reviewedAt = Date.parse(`${ledger?.review?.reviewedAt ?? ''}T00:00:00Z`);
  if (!Number.isFinite(reviewedAt) || now.getTime() - reviewedAt > 14 * 24 * 60 * 60 * 1000) {
    failures.push({ code: 'UIFN_A11Y_LEDGER_STALE', reason: 'review-cadence' });
  }
  if ((ledger?.primitives ?? []).length !== primitiveById.size) failures.push({ code: 'UIFN_A11Y_RULE_MISSING', reason: 'primitive-count' });
  const seen = new Set();
  for (const entry of ledger?.primitives ?? []) {
    const primitive = primitiveById.get(entry.primitive);
    if (!primitive || seen.has(entry.primitive)) {
      failures.push({ code: 'UIFN_A11Y_RULE_MISSING', primitive: entry.primitive, reason: primitive ? 'duplicate' : 'unknown' });
      continue;
    }
    seen.add(entry.primitive);
    if (!Array.isArray(entry.apgDeviations) || entry.apgDeviations.length === 0 || entry.apgDeviations.some((deviation) => !deviation.decision || !deviation.rationale)) {
      failures.push({ code: 'UIFN_A11Y_APG_DEVIATION_MISSING', primitive: entry.primitive });
    }
    const rules = new Map((entry.rules ?? []).map((rule) => [rule.id, rule]));
    for (const id of PHASE_18_RULES) {
      const rule = rules.get(id);
      if (!rule) {
        failures.push({ code: 'UIFN_A11Y_RULE_MISSING', primitive: entry.primitive, rule: id });
        continue;
      }
      if (rule.applicability === 'not-applicable' && (!rule.rationale || rule.rationale.length < 12)) {
        failures.push({ code: 'UIFN_A11Y_NA_UNJUSTIFIED', primitive: entry.primitive, rule: id });
      }
      for (const field of ['automatedVectorIds', 'manualVectorIds', 'evidenceIds']) {
        if (!Array.isArray(rule[field]) || rule[field].length === 0) failures.push({ code: 'UIFN_A11Y_RULE_MISSING', primitive: entry.primitive, rule: id, field });
      }
    }
    if (!Array.isArray(entry.modes) || entry.modes.length === 0) failures.push({ code: 'UIFN_A11Y_RULE_MISSING', primitive: entry.primitive, reason: 'modes' });
    for (const mode of entry.modes ?? []) {
      if (!mode.automation?.packageStoryIds?.length || !mode.automation?.sourceFixtureIds?.length || !mode.ruleIds?.length) {
        failures.push({ code: 'UIFN_A11Y_RULE_MISSING', primitive: entry.primitive, mode: mode.id, reason: 'mode-mapping' });
      }
    }
  }
  return failures;
}

export function inspectObservedAssertion(assertion) {
  if (!assertion || assertion.observed !== true || !assertion.beforeSha256 || !assertion.afterSha256) {
    return { code: 'UIFN_ASSERTION_NOT_OBSERVED', reason: 'missing-observation' };
  }
  if (assertion.requiresTransition && assertion.beforeSha256 === assertion.afterSha256 && assertion.focusBefore === assertion.focusAfter) {
    return { code: assertion.kind === 'focus-containment' ? 'UIFN_A11Y_FOCUS_ESCAPE' : 'UIFN_ASSERTION_NOT_OBSERVED', reason: 'no-required-transition' };
  }
  if (assertion.durationMs === 0 && assertion.syntheticAutoPass === true) {
    return { code: 'UIFN_ASSERTION_NOT_OBSERVED', reason: 'zero-duration-auto-pass' };
  }
  return null;
}

export function inspectTraceParity(traces) {
  const failures = [];
  const groups = new Map();
  for (const trace of traces) {
    const key = trace.primitive;
    const records = groups.get(key) ?? [];
    records.push(trace);
    groups.set(key, records);
  }
  for (const [primitive, records] of groups) {
    if (records.length !== 6) failures.push({ code: 'UIFN_A11Y_PACKAGE_SOURCE_DRIFT', primitive, reason: 'trace-count', actual: records.length });
    for (const installMode of ['package', 'source']) {
      const expected = records.find((trace) => trace.installMode === installMode && trace.framework === 'react');
      for (const actual of records.filter((trace) => trace.installMode === installMode && trace.framework !== 'react')) {
        if (!expected || !compareSemanticTraces(expected, actual).ok) failures.push({ code: 'UIFN_A11Y_FRAMEWORK_DIVERGENCE', primitive, framework: actual.framework, installMode });
      }
    }
    for (const framework of ['react', 'svelte', 'solid']) {
      const source = records.find((trace) => trace.installMode === 'source' && trace.framework === framework);
      const packed = records.find((trace) => trace.installMode === 'package' && trace.framework === framework);
      if (!source || !packed || !compareSemanticTraces(source, { ...packed, installMode: 'source' }).ok) failures.push({ code: 'UIFN_A11Y_PACKAGE_SOURCE_DRIFT', primitive, framework });
    }
    for (const trace of records) {
      const cleanup = trace.cleanup ?? {};
      const leaked = Object.entries(cleanup).filter(([key, value]) => !['controllerDestroyed', 'domReleased'].includes(key) && value !== 0);
      if (cleanup.controllerDestroyed !== true || cleanup.domReleased !== true || leaked.length) failures.push({ code: 'UIFN_A11Y_CLEANUP_LEAK', primitive, framework: trace.framework, installMode: trace.installMode });
      if ((trace.actions ?? []).some((action) => action.observed !== true)) failures.push({ code: 'UIFN_ASSERTION_NOT_OBSERVED', primitive, framework: trace.framework, installMode: trace.installMode });
    }
  }
  return failures;
}

export function validateFailureArtifact(artifact) {
  const failures = [];
  const required = ['code', 'primitive', 'framework', 'deliveryMode', 'browser', 'version', 'sourceHash', 'dom', 'semanticTrace', 'eventTrace', 'focusPath', 'screenshot', 'capturedAt', 'expiresAt'];
  for (const field of required) if (artifact?.[field] === undefined || artifact?.[field] === null || artifact?.[field] === '') failures.push({ code: 'UIFN_A11Y_FAILURE_ARTIFACT_INCOMPLETE', field });
  const serialized = JSON.stringify(artifact ?? {});
  if (/\/(?:Users|home|private\/var|Volumes)\//.test(serialized) || /(?:Bearer|token|password|secret)=/i.test(serialized)) failures.push({ code: 'UIFN_A11Y_FAILURE_ARTIFACT_UNSANITIZED' });
  if (artifact?.screenshot && !/^[A-Za-z0-9_.-]+\.png$/.test(artifact.screenshot)) failures.push({ code: 'UIFN_A11Y_FAILURE_ARTIFACT_INCOMPLETE', field: 'screenshot' });
  if (Date.parse(artifact?.expiresAt ?? '') <= Date.parse(artifact?.capturedAt ?? '')) failures.push({ code: 'UIFN_A11Y_FAILURE_ARTIFACT_INCOMPLETE', field: 'expiresAt' });
  return failures;
}

export function phase18MutationResults(validLedger, catalog) {
  const reviewTime = { now: new Date('2026-07-24T12:00:00Z') };
  const menuLedger = structuredClone(validLedger);
  const menu = menuLedger.primitives.find((entry) => entry.primitive === 'menu');
  const keyboard = menu.rules.find((rule) => rule.id === 'keyboard');
  keyboard.applicability = 'not-applicable';
  keyboard.rationale = '';

  const tooltipLedger = structuredClone(validLedger);
  const tooltip = tooltipLedger.primitives.find((entry) => entry.primitive === 'tooltip');
  tooltip.rules = tooltip.rules.filter((rule) => rule.id !== 'accessible-name');

  const unobserved = inspectObservedAssertion({
    kind: 'focus-containment',
    observed: true,
    requiresTransition: true,
    beforeSha256: 'a'.repeat(64),
    afterSha256: 'a'.repeat(64),
    focusBefore: 'outside',
    focusAfter: 'outside',
    durationMs: 0,
    syntheticAutoPass: true,
  });

  return [
    { mutation: 'menu-keyboard-na-without-rationale', expected: 'UIFN_A11Y_NA_UNJUSTIFIED', observed: validateLedger(menuLedger, catalog, reviewTime)[0]?.code },
    { mutation: 'tooltip-accessible-name-rule-removed', expected: 'UIFN_A11Y_RULE_MISSING', observed: validateLedger(tooltipLedger, catalog, reviewTime).find((failure) => failure.primitive === 'tooltip')?.code },
    { mutation: 'dialog-focus-trap-removed', expected: 'UIFN_A11Y_FOCUS_ESCAPE', observed: unobserved?.code },
    { mutation: 'irrelevant-zero-duration-assertion', expected: 'UIFN_ASSERTION_NOT_OBSERVED', observed: inspectObservedAssertion({ observed: true, beforeSha256: 'a'.repeat(64), afterSha256: 'b'.repeat(64), durationMs: 0, syntheticAutoPass: true })?.code },
  ];
}

export function phase18SemanticMutationResults(validTraces) {
  function mutate(id, expected, apply) {
    const traces = structuredClone(validTraces);
    apply(traces);
    const issues = inspectTraceParity(traces);
    const observed = issues.find((issue) => issue.code === expected)?.code;
    return {
      mutation: id,
      expected,
      observed,
      issueCount: issues.length,
    };
  }

  function trace(traces, primitive, framework, installMode) {
    const value = traces.find((entry) => entry.primitive === primitive && entry.framework === framework && entry.installMode === installMode);
    if (!value) throw new Error(`UIFN_A11Y_MUTATION_TRACE_MISSING: ${primitive}/${framework}/${installMode}`);
    return value;
  }

  function part(value, partId) {
    const valuePart = value.parts.flatMap((checkpoint) => checkpoint.parts).find((entry) => entry.part === partId);
    if (!valuePart) throw new Error(`UIFN_A11Y_MUTATION_PART_MISSING: ${value.primitive}/${partId}`);
    return valuePart;
  }

  return [
    mutate('menu-aria-expanded-corrupted', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE', (traces) => {
      part(trace(traces, 'Menu', 'solid', 'package'), 'trigger').aria.expanded = 'mixed';
    }),
    mutate('clipboard-callback-order-reversed', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE', (traces) => {
      const value = trace(traces, 'Clipboard', 'svelte', 'package');
      value.callbacks.reverse();
      value.callbacks.forEach((callback, index) => { callback.sequence = index + 1; });
    }),
    mutate('toast-announcement-politeness-corrupted', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE', (traces) => {
      const value = trace(traces, 'Toast', 'solid', 'package');
      value.transactions.at(-1).state.announcements[0].politeness = 'assertive';
      value.callbacks[0].arguments[1] = 'assertive';
    }),
    mutate('dialog-cleanup-listener-leak', 'UIFN_A11Y_CLEANUP_LEAK', (traces) => {
      trace(traces, 'Dialog', 'react', 'package').cleanup.listeners = 1;
    }),
    mutate('button-source-package-drift', 'UIFN_A11Y_PACKAGE_SOURCE_DRIFT', (traces) => {
      for (const framework of ['react', 'svelte', 'solid']) {
        part(trace(traces, 'Button', framework, 'source'), 'root').role = 'presentation';
      }
    }),
    mutate('button-solid-framework-divergence', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE', (traces) => {
      part(trace(traces, 'Button', 'solid', 'package'), 'root').role = 'presentation';
    }),
  ];
}
