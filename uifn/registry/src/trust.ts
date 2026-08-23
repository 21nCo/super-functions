import { createHash, createPublicKey, verify } from 'node:crypto';
import { REGISTRY_CATALOG_PAYLOAD_JSON } from './generated/catalog';
import { REGISTRY_PUBLIC_KEY_PEM, REGISTRY_SIGNATURE } from './generated/signature';

export interface RegistryTrustResult {
  ok: boolean;
  code?: 'UIFN_REGISTRY_SIGNATURE_INVALID';
  keyId: string;
  catalogSha256: string;
}

export function verifyRegistryCatalogSignature(payload = REGISTRY_CATALOG_PAYLOAD_JSON): RegistryTrustResult {
  const catalogSha256 = createHash('sha256').update(payload).digest('hex');
  try {
    const publicKey = createPublicKey(REGISTRY_PUBLIC_KEY_PEM);
    const keyId = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 24);
    const valid = REGISTRY_SIGNATURE.algorithm === 'Ed25519'
      && REGISTRY_SIGNATURE.keyId === keyId
      && REGISTRY_SIGNATURE.catalogSha256 === catalogSha256
      && verify(null, Buffer.from(payload), publicKey, Buffer.from(REGISTRY_SIGNATURE.signatureBase64, 'base64'));
    return valid ? { ok: true, keyId, catalogSha256 } : { ok: false, code: 'UIFN_REGISTRY_SIGNATURE_INVALID', keyId, catalogSha256 };
  } catch {
    return { ok: false, code: 'UIFN_REGISTRY_SIGNATURE_INVALID', keyId: REGISTRY_SIGNATURE.keyId, catalogSha256 };
  }
}
