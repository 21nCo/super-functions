import type { ApiKeyConfig } from '../types/provider.js';
import type { ApiKeyCredentials } from '../types/connection.js';

/**
 * API Key authentication handler
 */
export class ApiKeyAuthHandler {
  constructor(private config: ApiKeyConfig) {}

  /**
   * Add API key to request headers
   */
  addToHeaders(headers: Record<string, string>, credentials: ApiKeyCredentials): Record<string, string> {
    if (!this.config.headerName) {
      return headers;
    }

    const value = this.config.prefix
      ? this.config.prefix + (/[^=\s]$/.test(this.config.prefix) ? ' ' : '') + credentials.apiKey
      : credentials.apiKey;

    return {
      ...headers,
      [this.config.headerName]: value,
    };
  }

  /**
   * Add API key to request parameters
   */
  addToParams(params: Record<string, any>, credentials: ApiKeyCredentials): Record<string, any> {
    if (!this.config.paramName) {
      return params;
    }

    return {
      ...params,
      [this.config.paramName]: credentials.apiKey,
    };
  }

  /**
   * Validate API key format
   */
  validate(apiKey: string): boolean {
    return typeof apiKey === 'string' && apiKey.length > 0;
  }
}
