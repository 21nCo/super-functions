#!/usr/bin/env node

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = process.argv[process.argv.indexOf('--private-key') + 1];
if (!keyPath || process.argv.indexOf('--private-key') < 0) throw new Error('Usage: sign-uifn-registry --private-key <ed25519-private-key>');
const payloadPath = path.join(root, 'uifn/registry/generated/catalog.json');
const payload = readFileSync(payloadPath);
const privateKey = createPrivateKey(readFileSync(path.resolve(keyPath)));
if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Registry signing key must be Ed25519.');
const publicKey = createPublicKey(privateKey);
const pinnedPublicKey = createPublicKey(readFileSync(path.join(root, 'uifn/registry/trust/registry-ed25519-public.pem')));
if (!publicKey.export({ type: 'spki', format: 'der' }).equals(
  pinnedPublicKey.export({ type: 'spki', format: 'der' }),
)) throw new Error('Registry signing key does not match the pinned trust root.');
const signature = sign(null, payload, privateKey);
if (!verify(null, payload, publicKey, signature)) throw new Error('Generated registry signature did not verify.');
const keyId = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 24);
const catalogSha256 = createHash('sha256').update(payload).digest('hex');
const envelope = { schemaVersion: 1, algorithm: 'Ed25519', keyId, catalogSha256, signatureBase64: signature.toString('base64') };
mkdirSync(path.join(root, 'uifn/registry/trust'), { recursive: true });
mkdirSync(path.join(root, 'uifn/registry/src/generated'), { recursive: true });
writeFileSync(path.join(root, 'uifn/registry/generated/catalog-signature.json'), `${JSON.stringify(envelope, null, 2)}\n`);
writeFileSync(path.join(root, 'uifn/registry/src/generated/signature.ts'), `/* Generated detached registry signature. */\nexport const REGISTRY_SIGNATURE = ${JSON.stringify(envelope, null, 2)} as const;\n`);
console.log(JSON.stringify({ ok: true, algorithm: envelope.algorithm, keyId, catalogSha256 }, null, 2));
