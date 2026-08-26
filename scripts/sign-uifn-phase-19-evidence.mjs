#!/usr/bin/env node

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPhase19Signature,
  phase19Sha256,
  verifyPhase19Signature,
} from './uifn-phase-19-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(code, detail) {
  console.error(JSON.stringify({ ok: false, code, detail }, null, 2));
  process.exit(1);
}

const kind = argument('--kind');
const input = argument('--input') ? path.resolve(argument('--input')) : null;
const output = argument('--output') ? path.resolve(argument('--output')) : null;
const privateKeyPath = argument('--private-key') ? path.resolve(argument('--private-key')) : null;
const publicKeyPath = argument('--public-key') ? path.resolve(argument('--public-key')) : null;
const signedBy = argument('--signed-by');
if (!['participants', 'manual', 'review'].includes(kind)) fail('UIFN_PHASE19_SIGN_KIND_INVALID', kind);
for (const [name, value] of Object.entries({ input, output, privateKeyPath, publicKeyPath, signedBy })) {
  if (!value) fail('UIFN_PHASE19_SIGN_ARGUMENT_MISSING', name);
}
if (![input, privateKeyPath, publicKeyPath].every(existsSync)) fail('UIFN_PHASE19_SIGN_INPUT_MISSING');
if (input === output) fail('UIFN_PHASE19_SIGN_OUTPUT_MUST_BE_DISTINCT');
const relativePrivateKey = path.relative(root, privateKeyPath);
if (!relativePrivateKey.startsWith('..') && !path.isAbsolute(relativePrivateKey)) {
  fail('UIFN_PHASE19_PRIVATE_KEY_IN_REPOSITORY', 'Private signing keys must remain outside the repository.');
}
const privateKeyStat = statSync(privateKeyPath);
if (!privateKeyStat.isFile()) {
  fail('UIFN_PHASE19_PRIVATE_KEY_INVALID', 'Private key path must identify a regular file.');
}
if ((privateKeyStat.mode & 0o077) !== 0) {
  fail('UIFN_PHASE19_PRIVATE_KEY_PERMISSIONS', 'Private key permissions must exclude group and other access.');
}

const document = JSON.parse(readFileSync(input, 'utf8'));
delete document.signature;
const serialized = JSON.stringify(document);
if (document.templateStatus || /<[^>]+>|template-not-evidence/.test(serialized)) {
  fail('UIFN_PHASE19_TEMPLATE_CANNOT_BE_SIGNED', 'Replace every template marker and placeholder before signing.');
}

const identities = {
  participants: {
    expectedClass: undefined,
    expectedSigner: 'uifn-accessibility-program-authority',
    expectedSignedAt: document.issuedAt,
  },
  manual: {
    expectedClass: 'manualAssistiveTechnology',
    expectedSigner: document.tester?.participantId,
    expectedSignedAt: document.timing?.completedAt,
  },
  review: {
    expectedClass: 'independentAccessibilityReview',
    expectedSigner: document.reviewer?.participantId,
    expectedSignedAt: document.timing?.completedAt,
  },
};
const identity = identities[kind];
if ((identity.expectedClass && document.evidenceClass !== identity.expectedClass)
  || identity.expectedSigner !== signedBy
  || !identity.expectedSignedAt) {
  fail('UIFN_PHASE19_SIGN_IDENTITY_MISMATCH');
}

const privateKey = readFileSync(privateKeyPath, 'utf8');
const publicKey = readFileSync(publicKeyPath, 'utf8');
document.signature = createPhase19Signature(document, {
  privateKey,
  publicKey,
  signedBy,
  signedAt: identity.expectedSignedAt,
});
const verification = verifyPhase19Signature(document, {
  publicKey,
  expectedSigner: signedBy,
  expectedSignedAt: identity.expectedSignedAt,
  failureCode: 'UIFN_PHASE19_SIGNATURE_SELF_CHECK_FAILED',
});
if (verification.length) fail('UIFN_PHASE19_SIGNATURE_SELF_CHECK_FAILED', verification);
try {
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
} catch (error) {
  fail('UIFN_PHASE19_SIGN_OUTPUT_EXISTS_OR_UNWRITABLE', error instanceof Error ? error.message : String(error));
}
console.log(JSON.stringify({
  ok: true,
  command: 'sign:uifn-phase-19',
  kind,
  signedBy,
  signedAt: identity.expectedSignedAt,
  output,
  payloadSha256: document.signature.payloadSha256,
  documentSha256: phase19Sha256(readFileSync(output)),
}, null, 2));
