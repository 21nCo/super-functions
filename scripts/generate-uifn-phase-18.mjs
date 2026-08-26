#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeOutputs } from './uifn-delivery-generator.mjs';
import {
  normalizeSemanticParts,
  expandPhase14ConsensusTraces,
  PHASE_18_LEDGER_REVISION,
  PHASE_18_RULES,
  sha256,
  stableJson,
} from './uifn-phase-18-contract.mjs';

export const PHASE_18_GENERATOR_VERSION = '18.0.0';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--write') ? 'write' : 'check';
const frameworks = ['react', 'svelte', 'solid'];
const deliveryModes = ['package', 'source'];
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const catalog = readJson('uifn/catalog/generated/catalog.json');
const storyInventory = readJson('uifn/storybook/generated/story-inventory.json');
const traceSource = 'uifn/evidence/generated/phase-14/phase-14-semantic-traces.json';
const traceSets = expandPhase14ConsensusTraces(readJson(traceSource));
const tracesByPrimitive = new Map();
for (const trace of traceSets) {
  const id = catalog.primitives.find((primitive) => primitive.name === trace.primitive)?.id;
  if (!id) throw new Error(`UIFN_A11Y_TRACE_UNKNOWN_PRIMITIVE: ${trace.primitive}`);
  const records = tracesByPrimitive.get(id) ?? [];
  records.push(trace);
  tracesByPrimitive.set(id, records);
}

function rule(primitive, id) {
  const formNA = id === 'form' && primitive.formSemantics.participation === 'none';
  const descriptionNA = id === 'description' && primitive.accessibility.rules.description.supported === false;
  const notApplicable = formNA || descriptionNA;
  const rationale = formNA
    ? 'The primitive has no form participation; the automated vector verifies that it does not submit a value or expose validation state.'
    : descriptionNA
      ? 'The reviewed primitive contract does not support a description relationship; the automated vector verifies that no false relationship is emitted.'
      : 'Applicable to the reviewed primitive behavior and every declared mode.';
  return {
    id,
    applicability: notApplicable ? 'not-applicable' : 'applicable',
    rationale,
    normativeReferences: id === 'normative-semantics'
      ? primitive.accessibility.rules.normativeBasis
      : id === 'zoom-reflow'
        ? ['WCAG-2.2-1.4.10']
        : primitive.accessibility.rules.wcag.map((criterion) => `WCAG-2.2-${criterion}`),
    automatedVectorIds: ['TV-A11Y-001-P', 'TV-A11Y-002-P'],
    manualVectorIds: [`P19-${primitive.id}-${id}`],
    evidenceIds: [
      'EVID-P18-NORMATIVE-LEDGER',
      'EVID-P18-AUTOMATED-BROWSER',
      `EVID-P19-${primitive.id}-${id}-PENDING`,
    ],
    manualEvidenceStatus: 'phase-19-required-not-generated',
  };
}

function traceContract(primitive) {
  const traces = tracesByPrimitive.get(primitive.id) ?? [];
  const first = traces[0];
  const changedKeys = [...new Set(traces.flatMap((trace) => trace.transactions?.flatMap((transaction) => transaction.changedKeys ?? []) ?? []))].sort();
  const callbacks = [...new Set(traces.flatMap((trace) => trace.callbacks?.map((callback) => callback.name) ?? []))].sort();
  const actions = [...new Set(traces.flatMap((trace) => trace.actions?.map((action) => action.name) ?? []))].sort();
  return {
    canonicalTraceCount: traces.length,
    expectedSemanticParts: normalizeSemanticParts(first),
    observedActions: actions,
    observedCallbacks: callbacks,
    observedChangedKeys: changedKeys,
    requiredAssertions: [
      { id: `${primitive.id}-semantic-tree`, kind: 'semantic-tree', requiresTransition: false, expected: 'Exact reviewed part, tag, role, ARIA, data-state, and relationship contract.' },
      { id: `${primitive.id}-transition`, kind: 'semantic-transition', requiresTransition: actions.length > 0, expected: actions.length ? `Observe ${actions.join(', ')} and changed keys ${changedKeys.join(', ') || 'declared state'}.` : 'Observe stable native semantics without inventing a transition.' },
      { id: `${primitive.id}-event-order`, kind: 'event-order', requiresTransition: callbacks.length > 0, expected: callbacks.length ? `Observe callback order for ${callbacks.join(', ')} after controller transition.` : 'Observe that no undeclared callback is emitted.' },
      { id: `${primitive.id}-focus`, kind: 'focus-path', requiresTransition: primitive.accessibility.rules.focus.length > 0, expected: primitive.accessibility.rules.focus.join('; ') },
      { id: `${primitive.id}-cleanup`, kind: 'cleanup', requiresTransition: false, expected: 'Zero listeners, observers, timers, frames, portals, layers, locks, inert roots, child services, subscriptions, and connected semantic nodes after unmount.' },
    ],
  };
}

const ledgerPrimitives = catalog.primitives.map((primitive) => {
  const modes = [...new Set(storyInventory.stories.filter((story) => story.primitive === primitive.id).map((story) => story.scenario))];
  return {
    primitive: primitive.id,
    name: primitive.name,
    behaviorFamily: primitive.behaviorFamily,
    normativeBasis: primitive.accessibility.rules.normativeBasis,
    nativeSemantics: primitive.accessibility.rules.nativeSemantics,
    wcag22AA: primitive.accessibility.rules.wcag,
    accessibleName: primitive.accessibility.rules.accessibleName,
    description: primitive.accessibility.rules.description,
    keyboard: primitive.accessibility.rules.keyboard,
    focus: primitive.accessibility.rules.focus,
    pointerTouch: primitive.accessibility.rules.pointerTouch,
    announcements: primitive.accessibility.rules.announcements,
    formSemantics: primitive.formSemantics,
    preferences: primitive.accessibility.rules.preferences,
    primitiveNotes: primitive.accessibility.primitiveNotes,
    apgDeviations: [{
      decision: 'none-known-after-primitive-review',
      rationale: `The ${primitive.name} contract follows its declared native/APG basis. Primitive notes and native semantics above are controlling where APG examples are non-normative or inapplicable.`,
    }],
    rules: PHASE_18_RULES.map((id) => rule(primitive, id)),
    modes: modes.map((id) => ({
      id,
      ruleIds: [...PHASE_18_RULES],
      automation: {
        packageStoryIds: frameworks.map((framework) => `stable-${primitive.id}--${id}:${framework}`),
        sourceFixtureIds: frameworks.map((framework) => `source-${framework}-${primitive.id}`),
        evidenceIds: ['EVID-P18-AUTOMATED-BROWSER'],
      },
    })),
    traceContract: traceContract(primitive),
  };
});

const catalogSource = readFileSync(path.join(root, 'uifn/catalog/generated/catalog.json'), 'utf8');
const inventorySource = readFileSync(path.join(root, 'uifn/storybook/generated/story-inventory.json'), 'utf8');
const traceHashes = [{ path: traceSource, sha256: sha256(readFileSync(path.join(root, traceSource))) }];
const definitionSha256 = sha256([catalogSource, inventorySource, ...traceHashes.map((entry) => `${entry.path}:${entry.sha256}`)].join('\n'));

const ledger = {
  schemaVersion: 1,
  revision: PHASE_18_LEDGER_REVISION,
  generatorVersion: PHASE_18_GENERATOR_VERSION,
  catalogVersion: catalog.catalogVersion,
  definitionSha256,
  normativeStandard: 'WCAG 2.2 Level A and AA',
  review: {
    owner: 'uifn-maintainer',
    status: 'reviewed',
    reviewedAt: '2026-07-24',
    cadenceDays: 14,
    scope: `All ${catalog.primitives.length} stable primitives and every catalog-declared behavior mode.`,
  },
  releaseGate: {
    automatedStatus: 'provisional-pending-phase-19',
    compatibilityStatus: 'provisional-pending-signed-external-phase-14-cells',
    claim10of10Allowed: false,
  },
  ruleIds: PHASE_18_RULES,
  primitiveCount: ledgerPrimitives.length,
  modeCount: ledgerPrimitives.reduce((count, primitive) => count + primitive.modes.length, 0),
  traceHashes,
  primitives: ledgerPrimitives,
};

const matrix = [
  { id: 'chromium-package-all-stories', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['all'], viewport: 'desktop', vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-package-source-roots', engine: 'chromium', deliveryModes, frameworks, scenarios: ['default'], viewport: 'desktop', vectors: ['TV-A11Y-001-P', 'TV-A11Y-002-P'] },
  { id: 'firefox-keyboard-semantics', engine: 'firefox', deliveryModes: ['package'], frameworks, scenarios: ['default', 'keyboard-focus'], viewport: 'desktop', vectors: ['TV-A11Y-002-P'] },
  { id: 'webkit-keyboard-semantics', engine: 'webkit', deliveryModes: ['package'], frameworks, scenarios: ['default', 'keyboard-focus'], viewport: 'desktop', vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-forced-colors', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['forced-colors'], viewport: 'desktop', forcedColors: 'active', vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-reduced-motion', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['reduced-motion'], viewport: 'desktop', reducedMotion: 'reduce', vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-rtl', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['rtl'], viewport: 'desktop', direction: 'rtl', vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-zoom-200', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['responsive'], viewport: 'desktop', zoomPercent: 200, vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-zoom-400', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['responsive'], viewport: 'desktop', zoomPercent: 400, vectors: ['TV-A11Y-002-P'] },
  { id: 'chromium-android-emulation', engine: 'chromium', deliveryModes: ['package'], frameworks, scenarios: ['responsive', 'keyboard-focus'], viewport: 'mobile-emulation', pointer: 'touch', certification: 'emulation-not-device', vectors: ['TV-A11Y-002-P'] },
  { id: 'webkit-ios-emulation', engine: 'webkit', deliveryModes: ['package'], frameworks, scenarios: ['responsive', 'keyboard-focus'], viewport: 'mobile-emulation', pointer: 'touch', certification: 'emulation-not-device', vectors: ['TV-A11Y-002-P'] },
];

const automation = {
  schemaVersion: 1,
  phase: 'PHASE_18',
  generatorVersion: PHASE_18_GENERATOR_VERSION,
  definitionSha256,
  matrix,
  requiredAssertions: ['axe-serious-critical-zero', 'exact-semantic-tree', 'accessible-name-description', 'role-state-transition', 'keyboard-focus-path', 'pointer-touch-result', 'form-result', 'announcement-semantics', 'forced-colors', 'reduced-motion', 'rtl-bidi', 'zoom-reflow', 'cleanup'],
  fixturePolicy: {
    package: 'Packed public npm tarballs installed into clean consumers and built Storybook workbenches.',
    source: 'Registry CLI materialization into clean consumers; browser roots plus canonical semantic traces must match package behavior.',
    irrelevantAssertions: 'forbidden',
    zeroDurationAutoPass: 'forbidden',
  },
  failureArtifacts: {
    required: ['failure.json', 'screenshot.png'],
    fields: ['sanitized-dom', 'semantic-trace', 'event-trace', 'focus-path', 'browser-framework-version', 'source-hash', 'stable-code'],
    retentionDays: 7,
    absolutePaths: 'forbidden',
    secrets: 'forbidden',
  },
  mutationCodes: [
    'UIFN_A11Y_NA_UNJUSTIFIED',
    'UIFN_A11Y_RULE_MISSING',
    'UIFN_A11Y_FOCUS_ESCAPE',
    'UIFN_ASSERTION_NOT_OBSERVED',
    'UIFN_A11Y_PACKAGE_SOURCE_DRIFT',
    'UIFN_A11Y_FRAMEWORK_DIVERGENCE',
    'UIFN_A11Y_CLEANUP_LEAK',
  ],
};

const assistiveTechnologies = [
  { id: 'voiceover-macos', platform: 'macOS', browser: 'Safari', at: 'VoiceOver' },
  { id: 'voiceover-ios', platform: 'iOS device', browser: 'Safari', at: 'VoiceOver' },
  { id: 'nvda-windows', platform: 'Windows', browser: 'Firefox and Chromium/Edge', at: 'NVDA' },
  { id: 'talkback-android', platform: 'Android device', browser: 'Chrome', at: 'TalkBack' },
];
const manualScripts = catalog.primitives.flatMap((primitive) => assistiveTechnologies.map((at) => ({
  id: `P19-${primitive.id}-${at.id}`,
  primitive: primitive.id,
  ...at,
  preconditions: ['Use the exact release-candidate hash handed off by Phase 18.', 'Reset browser, AT verbosity, zoom, direction, color, motion, and input settings to the script baseline.', 'Record exact OS, browser, AT, framework, delivery mode, and source hash.'],
  steps: [
    `Navigate to the ${primitive.name} default fixture using sequential reading and focus navigation.`,
    `Confirm name, description, role, state, value, and relationships against ledger revision ${PHASE_18_LEDGER_REVISION}.`,
    `Execute ${primitive.accessibility.rules.keyboard.keys.join(', ')} where supported and record the focus path and state result.`,
    `Exercise pointer or touch behavior: ${primitive.accessibility.rules.pointerTouch.join('; ')}.`,
    `Exercise dynamic/error/disabled/nested modes where declared; confirm announcements without inferring speech from DOM.`,
  ],
  expectedOutcomes: [
    primitive.accessibility.rules.nativeSemantics,
    `Accessible name sources: ${primitive.accessibility.rules.accessibleName.sources.join(', ')}.`,
    `Focus: ${primitive.accessibility.rules.focus.join('; ')}.`,
    `Announcements: ${primitive.accessibility.rules.announcements.join('; ')}.`,
    'No keyboard trap, focus loss, duplicate or misleading announcement, inaccessible disabled state, or package/source/framework divergence.',
  ],
  evidenceId: `EVID-P19-${primitive.id}-${at.id}-PENDING`,
  status: 'phase-19-not-executed',
})));
const manualHandoff = {
  schemaVersion: 1,
  phase: 'PHASE_18-to-PHASE_19',
  ledgerRevision: PHASE_18_LEDGER_REVISION,
  definitionSha256,
  jaws: { status: 'deferred-by-user', releaseClaim: 'Not part of the current 10/10 matrix.' },
  assistiveTechnologies,
  scriptCount: manualScripts.length,
  scripts: manualScripts,
  handoff: {
    exactReleaseCandidateHashes: ['catalog', 'registry', 'framework tarballs', 'source templates', 'Storybook builds', 'automation evidence'],
    residualRisks: ['Real AT speech and navigation behavior is not inferred from DOM.', 'Mobile emulation is not physical-device certification.', 'Signed external browser/device compatibility cells remain release-blocking.', 'Independent accessibility review remains Phase 19.'],
    retestIssues: ['Any automated failure fixed after this handoff.', 'Every APG deviation, incomplete axe result, and manual mismatch.', 'Nested overlays, IME/mobile virtual keyboard, announcements, zoom/reflow, forced colors, RTL/bidi, and focus-not-obscured.'],
  },
};

const readme = `# uifn accessibility evidence

The generated, reviewed normative ledger, automated browser matrix, and manual accessibility handoff are maintained under \`uifn/evidence/generated/phase-18\`; this directory documents their status.

The automated result is deliberately provisional. It does not infer assistive-technology speech, does not represent emulation as physical-device evidence, and cannot authorize a 10/10 or release claim until the VoiceOver, NVDA, TalkBack, and independent-review evidence is signed. JAWS is deferred by explicit user decision.
`;

const outputs = {
  'uifn/evidence/generated/phase-18/normative-ledger.json': stableJson(ledger),
  'uifn/evidence/generated/phase-18/automation-manifest.json': stableJson(automation),
  'uifn/evidence/generated/phase-18/manual-handoff.json': stableJson(manualHandoff),
  'uifn/accessibility/README.md': `${readme.trimEnd()}\n`,
};
const failures = materializeOutputs(root, outputs, {
  mode,
  errorCode: 'UIFN_PHASE18_GENERATED_DRIFT',
  managedRoots: ['uifn/evidence/generated/phase-18'],
});
if (failures.length) {
  console.error(stableJson({ ok: false, command: 'generate:uifn-phase-18:check', failures }));
  process.exitCode = 1;
} else {
  console.log(stableJson({ ok: true, command: mode === 'write' ? 'generate:uifn-phase-18' : 'generate:uifn-phase-18:check', primitiveCount: ledger.primitiveCount, modeCount: ledger.modeCount, ruleCount: ledger.primitiveCount * PHASE_18_RULES.length, manualScriptCount: manualHandoff.scriptCount, definitionSha256 }));
}
