import type { Adapter as DbAdapter } from '@superfunctions/db';
import {
  AesGcmTokenCipher,
  DbAdapterTokenVault,
  EncryptedTokenVault,
  type TokenKeyResolver,
} from '@superfunctions/oauth-storage';
import { createHash } from 'node:crypto';
import {
  DEFAULT_PLUGFN_STORAGE_MODELS,
  type PlugFnStorageModelMapping,
} from './adapters/database.js';

export const DEFAULT_TOKEN_KEY_REF = 'plugfn-key-v1';

export interface CreatePlugFnEncryptedTokenVaultOptions {
  database: DbAdapter;
  encryptionKey: string;
  models?: Partial<PlugFnStorageModelMapping>;
  keyRef?: string;
  keyResolver?: TokenKeyResolver;
  now?: () => string;
}

export function createPlugFnEncryptedTokenVault(
  options: CreatePlugFnEncryptedTokenVaultOptions
): {
  encryptedTokenVault: EncryptedTokenVault;
  keyRef: string;
} {
  const keyRef = options.keyRef ?? DEFAULT_TOKEN_KEY_REF;
  const tokenVault = new DbAdapterTokenVault(
    options.database,
    options.models?.oauthTokens ?? DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens
  );
  const keyResolver =
    options.keyResolver ?? createDefaultTokenKeyResolver(options.encryptionKey);

  return {
    encryptedTokenVault: new EncryptedTokenVault(
      tokenVault,
      new AesGcmTokenCipher(keyResolver),
      options.now ?? (() => new Date().toISOString())
    ),
    keyRef,
  };
}

export function createDefaultTokenKeyResolver(encryptionKey: string): TokenKeyResolver {
  return async (keyRef: string): Promise<Buffer> => {
    return createHash('sha256').update(`${keyRef}:${encryptionKey}`).digest();
  };
}
