import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { TokenRecord, TokenVault } from "./index.js";

export interface OAuthTokenPayload {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
  idToken?: string;
}

export interface PersistTokenSetInput {
  tokenId: string;
  tenantId: string;
  userId: string;
  providerId: string;
  connectionId: string;
  tokenSet: OAuthTokenPayload;
  keyRef: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
}

export interface DecryptedTokenRecord {
  record: TokenRecord;
  tokenSet: OAuthTokenPayload;
}

export interface TokenCipher {
  encrypt(plaintext: string, keyRef: string): Promise<string>;
  decrypt(ciphertext: string, keyRef: string): Promise<string>;
}

export type TokenKeyResolver = (keyRef: string) => Promise<Buffer> | Buffer;

export class TokenVaultError extends Error {
  readonly code: "VALIDATION_ERROR" | "INTERNAL_ERROR";

  constructor(code: "VALIDATION_ERROR" | "INTERNAL_ERROR", message: string) {
    super(message);
    this.name = "TokenVaultError";
    this.code = code;
  }
}

export class AesGcmTokenCipher implements TokenCipher {
  private readonly resolveKey: TokenKeyResolver;

  constructor(resolveKey: TokenKeyResolver) {
    this.resolveKey = resolveKey;
  }

  async encrypt(plaintext: string, keyRef: string): Promise<string> {
    if (!keyRef) {
      throw new TokenVaultError("VALIDATION_ERROR", "keyRef is required");
    }

    const key = await this.getKey(keyRef);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(":");
  }

  async decrypt(ciphertext: string, keyRef: string): Promise<string> {
    if (!keyRef) {
      throw new TokenVaultError("VALIDATION_ERROR", "keyRef is required");
    }

    try {
      const [version, ivPart, authTagPart, payloadPart] = ciphertext.split(":");
      if (version !== "v1" || !ivPart || !authTagPart || !payloadPart) {
        throw new TokenVaultError("INTERNAL_ERROR", "Invalid encrypted payload format");
      }

      const key = await this.getKey(keyRef);
      const iv = Buffer.from(ivPart, "base64url");
      const authTag = Buffer.from(authTagPart, "base64url");
      const payload = Buffer.from(payloadPart, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
      return decrypted.toString("utf8");
    } catch (error) {
      if (error instanceof TokenVaultError) {
        throw error;
      }

      throw new TokenVaultError("INTERNAL_ERROR", "Failed to decrypt token payload");
    }
  }

  private async getKey(keyRef: string): Promise<Buffer> {
    try {
      const key = await this.resolveKey(keyRef);
      if (!Buffer.isBuffer(key) || key.length !== 32) {
        throw new TokenVaultError("INTERNAL_ERROR", `Invalid key material for keyRef ${keyRef}`);
      }

      return key;
    } catch (error) {
      if (error instanceof TokenVaultError) {
        throw error;
      }

      throw new TokenVaultError("INTERNAL_ERROR", `Key material unavailable for keyRef ${keyRef}`);
    }
  }
}

export class EncryptedTokenVault {
  private readonly store: TokenVault;
  private readonly cipher: TokenCipher;
  private readonly now: () => string;

  constructor(store: TokenVault, cipher: TokenCipher, now: () => string = () => new Date().toISOString()) {
    this.store = store;
    this.cipher = cipher;
    this.now = now;
  }

  async putTokenSet(input: PersistTokenSetInput): Promise<TokenRecord> {
    validatePersistTokenSetInput(input);

    const createdAt = input.createdAt ?? this.now();
    const updatedAt = input.updatedAt ?? createdAt;
    assertIsoTimestamp("createdAt", createdAt);
    assertIsoTimestamp("updatedAt", updatedAt);

    if (input.expiresAt) {
      assertIsoTimestamp("expiresAt", input.expiresAt);
    }

    const plaintext = JSON.stringify(input.tokenSet);
    const encryptedPayload = await this.cipher.encrypt(plaintext, input.keyRef);
    const record: TokenRecord = {
      tokenId: input.tokenId,
      tenantId: input.tenantId,
      userId: input.userId,
      providerId: input.providerId,
      connectionId: input.connectionId,
      encryptedPayload,
      keyRef: input.keyRef,
      createdAt,
      updatedAt,
      expiresAt: input.expiresAt
    };

    await this.store.put(record);
    return record;
  }

  async getTokenSet(tokenId: string): Promise<DecryptedTokenRecord | null> {
    const record = await this.store.get(tokenId);
    if (!record) {
      return null;
    }

    const tokenSet = await this.decryptTokenSet(record);
    return { record: cloneTokenRecord(record), tokenSet };
  }

  async getTokenSetByConnection(connectionId: string): Promise<DecryptedTokenRecord | null> {
    const record = await this.store.getByConnection(connectionId);
    if (!record) {
      return null;
    }

    const tokenSet = await this.decryptTokenSet(record);
    return { record: cloneTokenRecord(record), tokenSet };
  }

  async rotateKey(tokenId: string, newKeyRef: string): Promise<void> {
    if (!newKeyRef) {
      throw new TokenVaultError("VALIDATION_ERROR", "newKeyRef is required");
    }

    const existing = await this.store.get(tokenId);
    if (!existing) {
      return;
    }

    const plaintext = await this.cipher.decrypt(existing.encryptedPayload, existing.keyRef);
    const encryptedPayload = await this.cipher.encrypt(plaintext, newKeyRef);

    await this.store.put({
      ...existing,
      encryptedPayload,
      keyRef: newKeyRef,
      updatedAt: this.now()
    });
  }

  async deleteByConnection(connectionId: string): Promise<void> {
    await this.store.deleteByConnection(connectionId);
  }

  private async decryptTokenSet(record: TokenRecord): Promise<OAuthTokenPayload> {
    const plaintext = await this.cipher.decrypt(record.encryptedPayload, record.keyRef);

    try {
      const parsed = JSON.parse(plaintext) as Partial<OAuthTokenPayload>;
      if (!parsed.accessToken || typeof parsed.accessToken !== "string") {
        throw new TokenVaultError("INTERNAL_ERROR", "Token payload missing accessToken");
      }

      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
        scope: parsed.scope,
        tokenType: parsed.tokenType,
        idToken: parsed.idToken
      };
    } catch (error) {
      if (error instanceof TokenVaultError) {
        throw error;
      }

      throw new TokenVaultError("INTERNAL_ERROR", "Failed to parse decrypted token payload");
    }
  }
}

function validatePersistTokenSetInput(input: PersistTokenSetInput): void {
  if (!input.tokenId) {
    throw new TokenVaultError("VALIDATION_ERROR", "tokenId is required");
  }

  if (!input.connectionId || !input.tenantId || !input.userId || !input.providerId) {
    throw new TokenVaultError("VALIDATION_ERROR", "tenantId, userId, providerId, and connectionId are required");
  }

  if (!input.keyRef) {
    throw new TokenVaultError("VALIDATION_ERROR", "keyRef is required");
  }

  if (!input.tokenSet || !input.tokenSet.accessToken) {
    throw new TokenVaultError("VALIDATION_ERROR", "tokenSet.accessToken is required");
  }
}

function assertIsoTimestamp(fieldName: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new TokenVaultError("VALIDATION_ERROR", `${fieldName} must be a valid ISO-8601 timestamp`);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new TokenVaultError("VALIDATION_ERROR", `${fieldName} must be a valid ISO-8601 timestamp`);
  }
}

function cloneTokenRecord(record: TokenRecord): TokenRecord {
  return { ...record };
}
