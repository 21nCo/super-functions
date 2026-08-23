#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeOutputs } from './uifn-delivery-generator.mjs';
import {
  buildPhase19Matrix,
  canonicalJson,
  PHASE_19_AT_PROFILES,
  PHASE_19_DELIVERY_MODES,
  PHASE_19_FRAMEWORKS,
  PHASE_19_REVIEW_SCOPE,
} from './uifn-phase-19-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--write') ? 'write' : 'check';
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
const handoff = readJson('uifn/.conduct/generated/phase-18/manual-handoff.json');
const catalog = readJson('uifn/catalog/generated/catalog.json');
const ledger = readJson('uifn/.conduct/generated/phase-18/normative-ledger.json');
const matrix = buildPhase19Matrix(handoff, catalog, ledger);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const signatureSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['scheme', 'keyId', 'signedBy', 'signedAt', 'payloadSha256', 'value'],
  properties: {
    scheme: { const: 'ed25519' },
    keyId: { type: 'string', pattern: '^ed25519:[a-f0-9]{64}$' },
    signedBy: { type: 'string', minLength: 1 },
    signedAt: { type: 'string', format: 'date-time' },
    payloadSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    value: { type: 'string', minLength: 40 },
  },
};

const sourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['commit', 'dirty', 'definitionSha256', 'artifactSetSha256', 'phase18EvidenceSha256', 'matrixDefinitionSha256', 'artifacts'],
  properties: {
    commit: { type: 'string', pattern: '^[a-f0-9]{40}$' },
    dirty: { const: false },
    definitionSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    artifactSetSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    phase18EvidenceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    matrixDefinitionSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    artifacts: {
      type: 'array',
      minItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['package', 'filename', 'sha256'],
        properties: {
          package: { type: 'string' },
          filename: { type: 'string' },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        },
      },
    },
  },
};

const timingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['startedAt', 'completedAt', 'expiresAt'],
  properties: {
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
  },
};

const humanObservationSchema = (identity) => ({
  type: 'object',
  additionalProperties: false,
  required: [identity, 'observedSpeech', 'observedNavigation', 'focusPath', 'result', 'humanObserved', 'automationInferred'],
  properties: {
    [identity]: { type: 'string', minLength: 1 },
    observedSpeech: { type: 'string', minLength: 2 },
    observedNavigation: { type: 'string', minLength: 2 },
    focusPath: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    result: { const: 'passed' },
    humanObserved: { const: true },
    automationInferred: { const: false },
  },
});

const sessionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'platform', 'osVersion', 'deviceName', 'deviceModel', 'physical', 'emulated', 'browser', 'assistiveTechnology', 'locale'],
  properties: {
    id: { type: 'string', minLength: 1 },
    platform: { enum: ['macOS', 'iOS', 'Windows', 'Android'] },
    osVersion: { type: 'string', minLength: 1 },
    deviceName: { type: 'string', minLength: 1 },
    deviceModel: { type: 'string', minLength: 1 },
    physical: { const: true },
    emulated: { const: false },
    browser: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'channel', 'version'],
      properties: {
        name: { enum: ['Safari', 'Firefox', 'Chrome', 'Edge'] },
        channel: { enum: ['current', 'previous'] },
        version: { type: 'string', minLength: 1 },
      },
    },
    assistiveTechnology: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'version', 'settings'],
      properties: {
        name: { enum: ['VoiceOver', 'NVDA', 'TalkBack'] },
        version: { type: 'string', minLength: 1 },
        settings: { type: 'string', minLength: 2 },
      },
    },
    locale: { type: 'string', minLength: 2 },
  },
};

const stepObservationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stepIndex', 'instruction', 'expected', 'observedSpeech', 'observedNavigation', 'focusPath', 'result', 'humanObserved', 'automationInferred'],
  properties: {
    stepIndex: { type: 'integer', minimum: 1 },
    instruction: { type: 'string', minLength: 2 },
    expected: { type: 'string', minLength: 2 },
    observedSpeech: { type: 'string', minLength: 2 },
    observedNavigation: { type: 'string', minLength: 2 },
    focusPath: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    result: { const: 'passed' },
    humanObserved: { const: true },
    automationInferred: { const: false },
  },
};

const executionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId', 'framework', 'deliveryMode', 'startedAt', 'completedAt', 'result', 'steps', 'modeObservations', 'stateObservations', 'eventObservations'],
  properties: {
    sessionId: { type: 'string', minLength: 1 },
    framework: { enum: [...PHASE_19_FRAMEWORKS] },
    deliveryMode: { enum: [...PHASE_19_DELIVERY_MODES] },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    result: { const: 'passed' },
    steps: { type: 'array', minItems: 1, items: stepObservationSchema },
    modeObservations: { type: 'array', minItems: 1, items: humanObservationSchema('modeId') },
    stateObservations: { type: 'array', minItems: 1, items: humanObservationSchema('stateName') },
    eventObservations: { type: 'array', items: humanObservationSchema('eventType') },
  },
};

const retestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['defectId', 'result', 'completedAt', 'humanObserved', 'automationInferred'],
  properties: {
    defectId: { type: 'string', minLength: 1 },
    result: { const: 'passed' },
    completedAt: { type: 'string', format: 'date-time' },
    humanObserved: { const: true },
    automationInferred: { const: false },
  },
};

const manualSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://uifn.dev/schemas/phase-19/manual-evidence.schema.json',
  title: 'uifn Phase 19 signed human assistive-technology evidence',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'evidenceId', 'evidenceClass', 'status', 'result', 'rowId', 'matrixRevision', 'scriptSha256', 'source', 'tester', 'sessions', 'executions', 'defects', 'retests', 'timing', 'signature'],
  properties: {
    schemaVersion: { const: 1 },
    evidenceId: { type: 'string', pattern: '^EVID-P19-' },
    evidenceClass: { const: 'manualAssistiveTechnology' },
    status: { const: 'passed' },
    result: { const: 'passed' },
    rowId: { type: 'string', pattern: '^P19-' },
    matrixRevision: { const: 'uifn-manual-at-matrix-v1' },
    scriptSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    source: sourceSchema,
    tester: {
      type: 'object',
      additionalProperties: false,
      required: ['participantId', 'humanObserved', 'automationGenerated'],
      properties: {
        participantId: { type: 'string' },
        humanObserved: { const: true },
        automationGenerated: { const: false },
      },
    },
    sessions: { type: 'array', minItems: 1, items: sessionSchema },
    executions: { type: 'array', minItems: 6, items: executionSchema },
    defects: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
    retests: { type: 'array', items: retestSchema },
    timing: timingSchema,
    signature: signatureSchema,
  },
};

const participantSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://uifn.dev/schemas/phase-19/participants.schema.json',
  title: 'Externally trust-root-signed human participant registry',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'registryId', 'status', 'issuedBy', 'issuedAt', 'expiresAt', 'participants', 'signature'],
  properties: {
    schemaVersion: { const: 1 },
    registryId: { const: 'uifn-phase-19-human-trust-v1' },
    status: { const: 'active' },
    issuedBy: { const: 'uifn-accessibility-program-authority' },
    issuedAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    participants: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'displayName', 'kind', 'automation', 'roles', 'qualifiedAtProfiles', 'independentOfImplementation', 'implementationPrincipalIds', 'identityEvidence', 'keyId', 'publicKeyPem', 'qualifications'],
        properties: {
          id: { type: 'string' },
          displayName: { type: 'string' },
          kind: { const: 'human' },
          automation: { const: false },
          roles: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['manual-at-tester', 'independent-accessibility-reviewer'] } },
          qualifiedAtProfiles: { type: 'array', uniqueItems: true, items: { enum: Object.keys(PHASE_19_AT_PROFILES) } },
          independentOfImplementation: { type: 'boolean' },
          implementationPrincipalIds: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
          identityEvidence: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'reference', 'verifiedBy', 'verifiedAt'],
            properties: {
              type: { type: 'string', minLength: 1 },
              reference: { type: 'string', minLength: 1 },
              verifiedBy: { const: 'uifn-accessibility-program-authority' },
              verifiedAt: { type: 'string', format: 'date-time' },
            },
          },
          keyId: { type: 'string', pattern: '^ed25519:[a-f0-9]{64}$' },
          publicKeyPem: { type: 'string', pattern: '^-----BEGIN PUBLIC KEY-----' },
          qualifications: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['issuer', 'subject', 'evidence', 'validUntil'],
              properties: {
                issuer: { type: 'string', minLength: 1 },
                subject: { type: 'string', minLength: 1 },
                evidence: { type: 'string', minLength: 2 },
                validUntil: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    signature: signatureSchema,
  },
};

const reviewSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://uifn.dev/schemas/phase-19/independent-review.schema.json',
  title: 'uifn Phase 19 independent accessibility assessment',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'evidenceId', 'evidenceClass', 'status', 'source', 'reviewer', 'independence', 'scope', 'methods', 'familySamples', 'manualEvidenceSetSha256', 'defectSetSha256', 'matrixDefinitionSha256', 'findings', 'retests', 'defectDispositions', 'assessment', 'supportStatement', 'timing', 'signature'],
  properties: {
    schemaVersion: { const: 1 },
    evidenceId: { type: 'string', pattern: '^EVID-P19-INDEPENDENT-' },
    evidenceClass: { const: 'independentAccessibilityReview' },
    status: { const: 'passed' },
    source: sourceSchema,
    reviewer: {
      type: 'object',
      additionalProperties: false,
      required: ['participantId'],
      properties: { participantId: { type: 'string', minLength: 1 } },
    },
    independence: {
      type: 'object',
      additionalProperties: false,
      required: ['implementedRelevantWave', 'reviewerIsImplementationOwner', 'conflicts', 'statement'],
      properties: {
        implementedRelevantWave: { const: false },
        reviewerIsImplementationOwner: { const: false },
        conflicts: { type: 'array', maxItems: 0 },
        statement: { type: 'string', minLength: 20 },
      },
    },
    scope: { type: 'array', minItems: PHASE_19_REVIEW_SCOPE.length, maxItems: PHASE_19_REVIEW_SCOPE.length, uniqueItems: true, items: { enum: [...PHASE_19_REVIEW_SCOPE] } },
    methods: { type: 'array', minItems: 4, items: { type: 'string', minLength: 20 } },
    familySamples: {
      type: 'array',
      minItems: 9,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['behaviorFamily', 'primitive', 'codeReviewed', 'evidenceReviewed'],
        properties: {
          behaviorFamily: { type: 'string', minLength: 1 },
          primitive: { type: 'string', minLength: 1 },
          codeReviewed: { const: true },
          evidenceReviewed: { const: true },
        },
      },
    },
    manualEvidenceSetSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    defectSetSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    matrixDefinitionSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['defectId', 'status'],
        properties: {
          defectId: { type: 'string', minLength: 1 },
          status: { enum: ['verified', 'closed'] },
        },
      },
    },
    retests: { type: 'array', items: retestSchema },
    defectDispositions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['defectId', 'severity', 'status', 'reviewed', 'decision'],
        properties: {
          defectId: { type: 'string', minLength: 1 },
          severity: { enum: ['P0', 'P1', 'P2', 'P3'] },
          status: { enum: ['new', 'triaged', 'mitigated', 'resolved', 'verified', 'closed'] },
          reviewed: { const: true },
          decision: { type: 'string', minLength: 10 },
        },
      },
    },
    assessment: {
      type: 'object',
      additionalProperties: false,
      required: ['qualification', 'score', 'claim', 'confidenceGates'],
      properties: {
        qualification: { const: 'unqualified' },
        score: { const: 10 },
        claim: { const: 'accessibility-confidence-10-of-10' },
        confidenceGates: {
          type: 'array',
          minItems: 10,
          maxItems: 10,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'status', 'evidence'],
            properties: {
              id: { type: 'integer', minimum: 1, maximum: 10 },
              status: { const: 'passed' },
              evidence: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
            },
          },
        },
      },
    },
    supportStatement: {
      type: 'object',
      additionalProperties: false,
      required: ['jaws', 'claimsUntestedSupport', 'requiredAssistiveTechnologiesPassed'],
      properties: {
        jaws: { const: 'not-tested-user-deferred' },
        claimsUntestedSupport: { const: false },
        requiredAssistiveTechnologiesPassed: { const: true },
      },
    },
    timing: timingSchema,
    signature: signatureSchema,
  },
};

const manualTemplate = {
  templateStatus: 'template-not-evidence',
  warning: 'This file is not accepted as evidence. A trusted qualified human must execute every exact row/browser/framework/delivery combination, replace all placeholders, and sign the canonical JSON with their externally registered Ed25519 key.',
  schemaVersion: 1,
  evidenceId: '<from matrix row>',
  evidenceClass: 'manualAssistiveTechnology',
  status: 'passed',
  result: 'passed',
  rowId: '<from matrix row>',
  matrixRevision: matrix.revision,
  scriptSha256: '<from matrix row>',
  source: {
    commit: '<clean 40-char release-candidate commit>',
    dirty: false,
    definitionSha256: '<Phase 18 definition SHA-256>',
    artifactSetSha256: '<Phase 14 tarball-set SHA-256>',
    phase18EvidenceSha256: '<Phase 18 evidence SHA-256>',
    matrixDefinitionSha256: matrix.definitionSha256,
    artifacts: [],
  },
  tester: { participantId: '<trusted human participant id>', humanObserved: true, automationGenerated: false },
  sessions: [{
    id: '<unique physical session id>',
    platform: '<macOS|iOS|Windows|Android>',
    osVersion: '<exact version>',
    deviceName: '<exact device name>',
    deviceModel: '<exact model>',
    physical: true,
    emulated: false,
    browser: { name: '<Safari|Firefox|Chrome|Edge>', channel: '<current|previous>', version: '<exact version>' },
    assistiveTechnology: { name: '<VoiceOver|NVDA|TalkBack>', version: '<exact version>', settings: '<exact verbosity/input settings>' },
    locale: '<exact locale>',
  }],
  executions: [{
    sessionId: '<matching session id>',
    framework: '<react|svelte|solid>',
    deliveryMode: '<package|source>',
    startedAt: '<ISO-8601>',
    completedAt: '<ISO-8601>',
    result: 'passed',
    steps: [{
      stepIndex: 1,
      instruction: '<exact matrix instruction>',
      expected: '<exact matrix outcome>',
      observedSpeech: '<literal human-observed speech or explicit no-speech observation>',
      observedNavigation: '<literal human-observed navigation/state>',
      focusPath: ['<ordered focus path>'],
      result: 'passed',
      humanObserved: true,
      automationInferred: false,
    }],
    modeObservations: [{
      modeId: '<every exact matrix requiredModes id>',
      observedSpeech: '<literal human observation>',
      observedNavigation: '<literal human observation>',
      focusPath: ['<ordered focus path>'],
      result: 'passed',
      humanObserved: true,
      automationInferred: false,
    }],
    stateObservations: [{
      stateName: '<every exact matrix requiredStates name>',
      observedSpeech: '<literal human observation>',
      observedNavigation: '<literal human observation>',
      focusPath: ['<ordered focus path>'],
      result: 'passed',
      humanObserved: true,
      automationInferred: false,
    }],
    eventObservations: [{
      eventType: '<every exact matrix requiredEvents type>',
      observedSpeech: '<literal human observation>',
      observedNavigation: '<literal human observation>',
      focusPath: ['<ordered focus path>'],
      result: 'passed',
      humanObserved: true,
      automationInferred: false,
    }],
  }],
  defects: [],
  retests: [],
  timing: { startedAt: '<ISO-8601>', completedAt: '<ISO-8601>', expiresAt: '<at most 90 days>' },
  signature: { scheme: 'ed25519', keyId: '<registered key id>', signedBy: '<participant id>', signedAt: '<same as completedAt>', payloadSha256: '<canonical unsigned payload SHA-256>', value: '<base64 Ed25519 signature>' },
};

const reviewTemplate = {
  templateStatus: 'template-not-evidence',
  warning: 'This file is not accepted as evidence. It must be completed and signed by a qualified reviewer independent of implementation and all manual testers.',
  schemaVersion: 1,
  evidenceId: 'EVID-P19-INDEPENDENT-<id>',
  evidenceClass: 'independentAccessibilityReview',
  status: 'passed',
  source: manualTemplate.source,
  reviewer: { participantId: '<trusted independent human participant id>' },
  independence: {
    implementedRelevantWave: false,
    reviewerIsImplementationOwner: false,
    conflicts: [],
    statement: '<documented independence statement>',
  },
  scope: [...PHASE_19_REVIEW_SCOPE],
  methods: [],
  familySamples: [],
  manualEvidenceSetSha256: '<canonical signed manual evidence set hash>',
  defectSetSha256: '<canonical defect set hash>',
  matrixDefinitionSha256: matrix.definitionSha256,
  findings: [],
  retests: [],
  defectDispositions: [],
  assessment: {
    qualification: 'unqualified',
    score: 10,
    claim: 'accessibility-confidence-10-of-10',
    confidenceGates: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, status: 'passed', evidence: [] })),
  },
  supportStatement: {
    jaws: 'not-tested-user-deferred',
    claimsUntestedSupport: false,
    requiredAssistiveTechnologiesPassed: true,
  },
  timing: manualTemplate.timing,
  signature: manualTemplate.signature,
};

const participantTemplate = {
  templateStatus: 'template-not-evidence',
  warning: 'This file is not accepted as evidence. An independently authorized accessibility-program authority must verify identities and qualifications, replace every placeholder, and sign the registry with the externally safeguarded root key.',
  schemaVersion: 1,
  registryId: 'uifn-phase-19-human-trust-v1',
  status: 'active',
  issuedBy: 'uifn-accessibility-program-authority',
  issuedAt: '<ISO-8601>',
  expiresAt: '<at most 90 days>',
  participants: [
    {
      id: '<unique tester participant id>',
      displayName: '<verified human name>',
      kind: 'human',
      automation: false,
      roles: ['manual-at-tester'],
      qualifiedAtProfiles: ['<one or more exact AT profile ids>'],
      independentOfImplementation: false,
      implementationPrincipalIds: [],
      identityEvidence: {
        type: '<external identity evidence type>',
        reference: '<unique external identity reference>',
        verifiedBy: 'uifn-accessibility-program-authority',
        verifiedAt: '<ISO-8601 at or before issuedAt>',
      },
      keyId: '<ed25519 public-key id>',
      publicKeyPem: '<PEM public key only>',
      qualifications: [{
        issuer: '<qualification issuer>',
        subject: '<exact displayName>',
        evidence: '<credential and practical assessment evidence>',
        validUntil: '<after registry expiry>',
      }],
    },
    {
      id: '<unique reviewer participant id>',
      displayName: '<verified independent reviewer name>',
      kind: 'human',
      automation: false,
      roles: ['independent-accessibility-reviewer'],
      qualifiedAtProfiles: [],
      independentOfImplementation: true,
      implementationPrincipalIds: [],
      identityEvidence: {
        type: '<external identity evidence type>',
        reference: '<different unique external identity reference>',
        verifiedBy: 'uifn-accessibility-program-authority',
        verifiedAt: '<ISO-8601 at or before issuedAt>',
      },
      keyId: '<different ed25519 public-key id>',
      publicKeyPem: '<different PEM public key only>',
      qualifications: [{
        issuer: '<qualification issuer>',
        subject: '<exact displayName>',
        evidence: '<independent review qualification evidence>',
        validUntil: '<after registry expiry>',
      }],
    },
  ],
  signature: {
    scheme: 'ed25519',
    keyId: '<pinned root public-key id>',
    signedBy: 'uifn-accessibility-program-authority',
    signedAt: '<same as issuedAt>',
    payloadSha256: '<canonical unsigned payload SHA-256>',
    value: '<base64 Ed25519 signature>',
  },
};

const readme = `# Phase 19 human accessibility evidence

This directory defines the fail-closed handoff for authentic VoiceOver, NVDA, TalkBack, and independent-review evidence.

## Trust boundary

- The ${matrix.rowCount}-row matrix is generated from the reviewed Phase 18 handoff: ${matrix.primitiveCount} primitives across VoiceOver macOS, VoiceOver iOS, NVDA Windows, and TalkBack Android.
- Every row covers React, Svelte, and Solid in package and source modes on the exact frozen release candidate.
- Every execution separately records all ${matrix.primitiveModeCount} primitive-mode declarations plus every canonical state and event; a generic row-level pass cannot hide missing error, edge, dynamic, destructive, modal, form, or interaction-state coverage.
- Safari current and previous, Firefox plus Chrome or Edge, and physical iOS/Android evidence are mandatory as declared by the profile.
- Participant identities and public keys are accepted only from a registry signed by an externally provisioned accessibility-program trust root. Repository-local self-registration is not a trust root.
- Human evidence and the independent assessment use detached Ed25519 signatures. Automation-created or unsigned files are rejected.
- The independent reviewer must be distinct from implementation owners and every manual tester.
- JAWS remains exactly \`not-tested-user-deferred\`; no passing support claim is inferred.

Templates are deliberately marked \`template-not-evidence\`. Generating them does not execute a manual test, create a signature, or satisfy Phase 19.

## Capture order

1. Freeze one clean release-candidate commit, rerun Phase 18, and preserve its exact evidence.
2. Complete and cryptographically verify all 35 Phase 14 compatibility cells for the same tarball set.
3. Independently provision and pin the authority root, then complete and sign \`participants.json\`.
4. For every matrix row, expand the manual template into all required real sessions and every React/Svelte/Solid package/source execution.
5. Record each exact script step plus every required mode, state, and event observation. Copying DOM/axe output or using generated prose is not a human observation.
6. Link every affected defect. A closed or verified defect requires a passing human-observed retest after defect creation and within the signed row's execution interval.
7. After all ${matrix.rowCount} rows validate, the distinct reviewer completes the family samples, exact defect dispositions, and a one-to-one human retest inside the review interval for every closed or verified review finding.
8. Complete the ten confidence gates and final signed assessment.
9. Run \`verify:uifn-phase-19\`. Any source/artifact change invalidates the affected evidence and requires rerun/retest.

## Required verifier inputs

- \`UIFN_PHASE19_EVIDENCE_DIR\`
- \`UIFN_PHASE19_PHASE18_EVIDENCE\`
- \`UIFN_PHASE19_TRACE_RUN\`
- \`UIFN_PHASE19_COMPAT_EVIDENCE_DIR\`
- \`UIFN_PHASE19_TRUST_ROOT_PUBLIC_KEY\`
- \`UIFN_PHASE19_TRUST_POLICY\` (defaults to the repository-pinned Phase 19 trust policy)
- \`UIFN_PHASE19_PARTICIPANTS\` (defaults to \`participants.json\` in the evidence directory)

Manual rows belong in \`manual/*.json\`, defects in \`defects/*.json\`, and the independent assessment in \`independent-review.json\`.

Use \`npm run sign:uifn-phase-19 -- --kind <participants|manual|review> --input <unsigned.json> --output <signed.json> --private-key <external-private.pem> --public-key <public.pem> --signed-by <participant-id>\` to create a detached signature. The signer rejects templates, repository-resident private keys, permissive private-key permissions, overwrites, identity mismatches, and signatures that fail immediate verification.
`;

const outputs = {
  'uifn/.conduct/accessibility/phase-19/matrix.json': json(matrix),
  'uifn/.conduct/accessibility/phase-19/manual-evidence.schema.json': json(manualSchema),
  'uifn/.conduct/accessibility/phase-19/participants.schema.json': json(participantSchema),
  'uifn/.conduct/accessibility/phase-19/independent-review.schema.json': json(reviewSchema),
  'uifn/.conduct/accessibility/phase-19/templates/manual-row.template.json': json(manualTemplate),
  'uifn/.conduct/accessibility/phase-19/templates/participants.template.json': json(participantTemplate),
  'uifn/.conduct/accessibility/phase-19/templates/independent-review.template.json': json(reviewTemplate),
  'uifn/.conduct/accessibility/phase-19/README.md': `${readme.trimEnd()}\n`,
};

const failures = materializeOutputs(root, outputs, {
  mode,
  errorCode: 'UIFN_PHASE19_GENERATED_DRIFT',
  managedRoots: ['uifn/.conduct/accessibility/phase-19'],
});
const result = {
  ok: failures.length === 0,
  command: mode === 'write' ? 'generate:uifn-phase-19' : 'generate:uifn-phase-19:check',
  matrixRevision: matrix.revision,
  definitionSha256: matrix.definitionSha256,
  primitiveCount: matrix.primitiveCount,
  rowCount: matrix.rowCount,
  observationMinimums: matrix.observationMinimums,
  canonicalSha256: canonicalJson(matrix).length > 0 ? matrix.definitionSha256 : null,
  failures,
};
console[failures.length ? 'error' : 'log'](json(result));
if (failures.length) process.exitCode = 1;
