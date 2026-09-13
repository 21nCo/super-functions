import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { SecFnEncryptionError } from "./errors.js";
import type {
  EncryptedSecretPayload,
  KeyMaterial,
  KeyProvider,
  SecretAadInput,
} from "./types.js";

const ALGORITHM = "aes-256-gcm";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export function createStaticKeyProvider(secret: string | Uint8Array, keyId = "default"): KeyProvider {
  return {
    resolveKey: () => ({ keyId, secret }),
  };
}

export function buildSecretAad(input: SecretAadInput): string {
  return JSON.stringify({
    tenantId: input.tenantId ?? null,
    namespace: input.namespace ?? null,
    secretId: input.secretId,
    version: input.version,
  });
}

export async function encryptSecret(
  plaintext: string,
  keyProvider: KeyProvider,
  aad: string,
): Promise<EncryptedSecretPayload> {
  const material = await keyProvider.resolveKey({ purpose: "encrypt" });
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(material, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: "AES-256-GCM",
    keyId: material.keyId,
    iv: iv.toString("base64url"),
    salt: salt.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export async function decryptSecret(
  payload: EncryptedSecretPayload,
  keyProvider: KeyProvider,
  aad: string,
): Promise<string> {
  try {
    const material = await keyProvider.resolveKey({
      keyId: payload.keyId,
      purpose: "decrypt",
    });
    const key = deriveKey(material, Buffer.from(payload.salt, "base64url"));
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(payload.iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new SecFnEncryptionError("Secret decryption failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyTokenHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function deriveKey(material: KeyMaterial, salt: Buffer): Buffer {
  const secret = typeof material.secret === "string"
    ? Buffer.from(material.secret, "utf8")
    : Buffer.from(material.secret);
  return pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, "sha256");
}
