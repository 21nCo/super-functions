import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { verifyPhase19Signature } from './uifn-phase-19-contract.mjs';

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'uifn-phase19-sign-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyPath = path.join(directory, 'private.pem');
  const publicKeyPath = path.join(directory, 'public.pem');
  const input = path.join(directory, 'participants.unsigned.json');
  const output = path.join(directory, 'participants.signed.json');
  writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  chmodSync(privateKeyPath, 0o600);
  writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
  writeFileSync(input, `${JSON.stringify({
    schemaVersion: 1,
    registryId: 'uifn-phase-19-human-trust-v1',
    status: 'active',
    issuedBy: 'uifn-accessibility-program-authority',
    issuedAt: '2026-07-26T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    participants: [],
  }, null, 2)}\n`);
  return {
    directory,
    privateKeyPath,
    publicKeyPath,
    publicKey,
    input,
    output,
  };
}

function sign(value, extra = []) {
  return spawnSync(process.execPath, [
    new URL('./sign-uifn-phase-19-evidence.mjs', import.meta.url).pathname,
    '--kind', 'participants',
    '--input', value.input,
    '--output', value.output,
    '--private-key', value.privateKeyPath,
    '--public-key', value.publicKeyPath,
    '--signed-by', 'uifn-accessibility-program-authority',
    ...extra,
  ], { encoding: 'utf8' });
}

test('signer writes a new detached signature and immediately verifiable document', (context) => {
  const value = fixture();
  context.after(() => rmSync(value.directory, { recursive: true, force: true }));
  const result = sign(value);
  assert.equal(result.status, 0, result.stderr);
  const document = JSON.parse(readFileSync(value.output, 'utf8'));
  assert.deepEqual(verifyPhase19Signature(document, {
    publicKey: value.publicKey,
    expectedSigner: 'uifn-accessibility-program-authority',
    expectedSignedAt: document.issuedAt,
    failureCode: 'UIFN_PHASE19_SIGNATURE_SELF_CHECK_FAILED',
  }), []);
});

test('signer refuses output overwrite with a stable failure code', (context) => {
  const value = fixture();
  context.after(() => rmSync(value.directory, { recursive: true, force: true }));
  assert.equal(sign(value).status, 0);
  const second = sign(value);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /UIFN_PHASE19_SIGN_OUTPUT_EXISTS_OR_UNWRITABLE/);
});

test('signer refuses permissive private-key permissions and template placeholders', (context) => {
  const value = fixture();
  context.after(() => rmSync(value.directory, { recursive: true, force: true }));
  chmodSync(value.privateKeyPath, 0o644);
  const permissive = sign(value);
  assert.notEqual(permissive.status, 0);
  assert.match(permissive.stderr, /UIFN_PHASE19_PRIVATE_KEY_PERMISSIONS/);

  chmodSync(value.privateKeyPath, 0o600);
  const template = JSON.parse(readFileSync(value.input, 'utf8'));
  template.templateStatus = 'template-not-evidence';
  writeFileSync(value.input, `${JSON.stringify(template, null, 2)}\n`);
  const placeholder = sign(value);
  assert.notEqual(placeholder.status, 0);
  assert.match(placeholder.stderr, /UIFN_PHASE19_TEMPLATE_CANNOT_BE_SIGNED/);
});
