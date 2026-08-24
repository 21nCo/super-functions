import { createHash, createPublicKey, verify } from 'node:crypto';
import { REGISTRY_CATALOG_PAYLOAD_JSON } from './generated/catalog';
import { REGISTRY_SIGNATURE } from './generated/signature';
import { REGISTRY_TRUST_ROOT_PUBLIC_KEY_PEM } from './trust-root';

export interface RegistryTrustResult {
  ok: boolean;
  code?: 'UIFN_REGISTRY_SIGNATURE_INVALID';
  keyId: string;
  catalogSha256: string;
}

export interface RegistrySignatureEnvelope {
  readonly schemaVersion: 1;
  readonly algorithm: 'Ed25519';
  readonly keyId: string;
  readonly catalogSha256: string;
  readonly signatureBase64: string;
}

export function verifyRegistryCatalogSignature(
  payload = REGISTRY_CATALOG_PAYLOAD_JSON,
  signature: RegistrySignatureEnvelope = REGISTRY_SIGNATURE,
): RegistryTrustResult {
  const catalogSha256 = createHash('sha256').update(payload).digest('hex');
  const signatureKeyId = signature && typeof signature === 'object' && typeof signature.keyId === 'string'
    ? signature.keyId
    : '';
  try {
    const publicKey = createPublicKey(REGISTRY_TRUST_ROOT_PUBLIC_KEY_PEM);
    const keyId = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 24);
    const valid = signature && typeof signature === 'object'
      && signature.algorithm === 'Ed25519'
      && signature.keyId === keyId
      && signature.catalogSha256 === catalogSha256
      && verify(null, Buffer.from(payload), publicKey, Buffer.from(signature.signatureBase64, 'base64'));
    return valid ? { ok: true, keyId, catalogSha256 } : { ok: false, code: 'UIFN_REGISTRY_SIGNATURE_INVALID', keyId, catalogSha256 };
  } catch {
    return { ok: false, code: 'UIFN_REGISTRY_SIGNATURE_INVALID', keyId: signatureKeyId, catalogSha256 };
  }
}
