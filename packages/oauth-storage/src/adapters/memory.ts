import type {
  OAuthConsentRecord,
  OAuthConsentStore,
  OAuthRevocationFailureRecord,
  OAuthRevocationFailureStore,
  OAuthStateRecord,
  OAuthStateStore,
  OAuthStoredSubject,
  TokenRecord,
  TokenVault
} from "../index.js";
import {
  cloneOAuthStateRecord,
  cloneOAuthStoredSubject,
  getOAuthSubjectKey,
  validateOAuthConsentRecord,
  validateOAuthRevocationFailureRecord,
  validateOAuthStateRecord
} from "../state-store.js";

export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly records = new Map<string, OAuthStateRecord>();

  async put(record: OAuthStateRecord): Promise<void> {
    validateOAuthStateRecord(record);
    this.records.set(record.stateId, cloneOAuthStateRecord(record));
  }

  async get(stateId: string): Promise<OAuthStateRecord | null> {
    const record = this.records.get(stateId);
    return record ? cloneOAuthStateRecord(record) : null;
  }

  async consume(stateId: string, consumedAt: string): Promise<OAuthStateRecord | null> {
    const record = this.records.get(stateId);
    if (!record) {
      return null;
    }

    if (record.consumedAt) {
      return null;
    }

    if (Date.parse(record.expiresAt) <= Date.parse(consumedAt)) {
      return null;
    }

    const consumed: OAuthStateRecord = { ...record, consumedAt };
    this.records.set(stateId, consumed);
    return cloneOAuthStateRecord(consumed);
  }

  async deleteExpired(before: string): Promise<number> {
    const checkpoint = Date.parse(before);
    let deleted = 0;

    for (const [stateId, record] of this.records.entries()) {
      if (Date.parse(record.expiresAt) < checkpoint) {
        this.records.delete(stateId);
        deleted += 1;
      }
    }

    return deleted;
  }
}

export class MemoryTokenVault implements TokenVault {
  private readonly tokensById = new Map<string, TokenRecord>();
  private readonly tokenByConnection = new Map<string, string>();

  async put(record: TokenRecord): Promise<void> {
    const previousRecord = this.tokensById.get(record.tokenId);
    if (previousRecord && previousRecord.connectionId !== record.connectionId) {
      this.tokenByConnection.delete(previousRecord.connectionId);
    }

    const existingTokenId = this.tokenByConnection.get(record.connectionId);
    if (existingTokenId && existingTokenId !== record.tokenId) {
      this.tokensById.delete(existingTokenId);
    }

    this.tokensById.set(record.tokenId, cloneTokenRecord(record));
    this.tokenByConnection.set(record.connectionId, record.tokenId);
  }

  async get(tokenId: string): Promise<TokenRecord | null> {
    const record = this.tokensById.get(tokenId);
    return record ? cloneTokenRecord(record) : null;
  }

  async getByConnection(connectionId: string): Promise<TokenRecord | null> {
    const tokenId = this.tokenByConnection.get(connectionId);
    if (!tokenId) {
      return null;
    }

    const record = this.tokensById.get(tokenId);
    if (!record) {
      this.tokenByConnection.delete(connectionId);
      return null;
    }
    if (record.connectionId !== connectionId) {
      this.tokenByConnection.delete(connectionId);
      return null;
    }
    return record ? cloneTokenRecord(record) : null;
  }

  async rotateKey(tokenId: string, newKeyRef: string): Promise<void> {
    const existing = this.tokensById.get(tokenId);
    if (!existing || existing.keyRef === newKeyRef) {
      return;
    }

    throw new Error("Token key rotation requires re-encryption; use EncryptedTokenVault.rotateKey");
  }

  async deleteByConnection(connectionId: string): Promise<void> {
    const tokenId = this.tokenByConnection.get(connectionId);
    if (!tokenId) {
      return;
    }

    this.tokenByConnection.delete(connectionId);
    this.tokensById.delete(tokenId);
  }
}

export class MemoryOAuthConsentStore implements OAuthConsentStore {
  private readonly consentsById = new Map<string, OAuthConsentRecord>();

  async put(record: OAuthConsentRecord): Promise<void> {
    validateOAuthConsentRecord(record);
    this.consentsById.set(record.consentId, cloneConsentRecord(record));
  }

  async get(consentId: string): Promise<OAuthConsentRecord | null> {
    const record = this.consentsById.get(consentId);
    return record ? cloneConsentRecord(record) : null;
  }

  async listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthConsentRecord[]> {
    const subjectKey = getOAuthSubjectKey(subject);
    return [...this.consentsById.values()]
      .filter((record) => record.providerId === providerId && getOAuthSubjectKey(record.subject) === subjectKey)
      .map(cloneConsentRecord);
  }

  async delete(consentId: string): Promise<void> {
    this.consentsById.delete(consentId);
  }
}

export class MemoryOAuthRevocationFailureStore implements OAuthRevocationFailureStore {
  private readonly failuresById = new Map<string, OAuthRevocationFailureRecord>();

  async put(record: OAuthRevocationFailureRecord): Promise<void> {
    validateOAuthRevocationFailureRecord(record);
    this.failuresById.set(record.failureId, cloneRevocationFailureRecord(record));
  }

  async get(failureId: string): Promise<OAuthRevocationFailureRecord | null> {
    const record = this.failuresById.get(failureId);
    return record ? cloneRevocationFailureRecord(record) : null;
  }

  async listBySubject(providerId: string, subject: OAuthStoredSubject): Promise<OAuthRevocationFailureRecord[]> {
    const subjectKey = getOAuthSubjectKey(subject);
    return [...this.failuresById.values()]
      .filter((record) => record.providerId === providerId && getOAuthSubjectKey(record.subject) === subjectKey)
      .map(cloneRevocationFailureRecord);
  }

  async delete(failureId: string): Promise<void> {
    this.failuresById.delete(failureId);
  }
}

function cloneTokenRecord(record: TokenRecord): TokenRecord {
  return { ...record };
}

function cloneConsentRecord(record: OAuthConsentRecord): OAuthConsentRecord {
  return {
    ...record,
    scopes: [...record.scopes],
    subject: cloneOAuthStoredSubject(record.subject),
    metadata: record.metadata ? { ...record.metadata } : undefined
  };
}

function cloneRevocationFailureRecord(record: OAuthRevocationFailureRecord): OAuthRevocationFailureRecord {
  return {
    ...record,
    subject: cloneOAuthStoredSubject(record.subject),
    metadata: record.metadata ? { ...record.metadata } : undefined
  };
}
