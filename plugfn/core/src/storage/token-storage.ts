import type { Credentials, EncryptedCredentials } from '../types/connection.js';
import { encrypt, decrypt, validateEncryptionKey } from '../utils/crypto.js';

/**
 * Secure token storage with encryption
 */
export class SecureTokenStorage {
  constructor(private encryptionKey: string) {
    validateEncryptionKey(encryptionKey);
  }

  /**
   * Encrypt credentials for storage
   */
  encryptCredentials(credentials: Credentials): EncryptedCredentials {
    const json = JSON.stringify(credentials);
    const encrypted = encrypt(json, this.encryptionKey);
    
    return {
      encrypted,
      algorithm: 'aes-256-gcm',
      keyRef: 'legacy-local',
      schemaVersion: 'legacy-v1',
    };
  }

  /**
   * Decrypt credentials from storage
   */
  decryptCredentials(encryptedCredentials: EncryptedCredentials): Credentials {
    const decrypted = decrypt(encryptedCredentials.encrypted, this.encryptionKey);
    return JSON.parse(decrypted);
  }

  /**
   * Check if credentials are expired
   */
  isExpired(credentials: Credentials): boolean {
    if (credentials.type === 'oauth2' && credentials.expiresAt) {
      return new Date() >= credentials.expiresAt;
    }
    return false;
  }

  /**
   * Get time until expiration in milliseconds
   */
  timeUntilExpiration(credentials: Credentials): number | null {
    if (credentials.type === 'oauth2' && credentials.expiresAt) {
      const expiresAt = new Date(credentials.expiresAt).getTime();
      const now = Date.now();
      return Math.max(0, expiresAt - now);
    }
    return null;
  }
}
