import type { BasicAuthCredentials } from '../types/connection.js';

/**
 * Basic authentication handler
 */
export class BasicAuthHandler {
  constructor() {}

  /**
   * Add Basic auth to request headers
   */
  addToHeaders(headers: Record<string, string>, credentials: BasicAuthCredentials): Record<string, string> {
    const encoded = this.encodeCredentials(credentials.username, credentials.password);
    
    return {
      ...headers,
      Authorization: `Basic ${encoded}`,
    };
  }

  /**
   * Encode credentials in Base64
   */
  private encodeCredentials(username: string, password: string): string {
    const credentials = `${username}:${password}`;
    return Buffer.from(credentials).toString('base64');
  }

  /**
   * Decode Basic auth header
   */
  decodeHeader(authHeader: string): BasicAuthCredentials | null {
    if (!authHeader.startsWith('Basic ')) {
      return null;
    }

    const encoded = authHeader.slice(6);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');

    if (!username || !password) {
      return null;
    }

    return {
      type: 'basic',
      username,
      password,
    };
  }

  /**
   * Validate credentials format
   */
  validate(credentials: BasicAuthCredentials): boolean {
    return (
      typeof credentials.username === 'string' &&
      credentials.username.length > 0 &&
      typeof credentials.password === 'string' &&
      credentials.password.length > 0
    );
  }
}

