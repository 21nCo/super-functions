import type { JWTConfig } from '../types/provider.js';
import type { JWTCredentials } from '../types/connection.js';
import { createSign, createVerify } from 'crypto';

/**
 * JWT authentication handler
 */
export class JWTAuthHandler {
  constructor(private config: JWTConfig) {}

  /**
   * Add JWT to request headers
   */
  addToHeaders(headers: Record<string, string>, credentials: JWTCredentials): Record<string, string> {
    return {
      ...headers,
      Authorization: `Bearer ${credentials.token}`,
    };
  }

  /**
   * Generate JWT token
   */
  async generateToken(payload: Record<string, any>): Promise<string> {
    if (!this.config.privateKey) {
      throw new Error('Private key required for JWT generation');
    }

    const header = {
      alg: this.config.algorithm,
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      ...payload,
      iat: now,
      ...(this.config.issuer && { iss: this.config.issuer }),
      ...(this.config.audience && { aud: this.config.audience }),
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(claims));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const signature = this.sign(signatureInput, this.config.privateKey);
    const encodedSignature = this.base64UrlEncode(signature);

    return `${signatureInput}.${encodedSignature}`;
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token: string): Promise<Record<string, any>> {
    if (!this.config.publicKey) {
      throw new Error('Public key required for JWT verification');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error('Invalid JWT format');
    }

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = this.base64UrlDecode(encodedSignature);

    const isValid = this.verify(signatureInput, signature, this.config.publicKey);
    
    if (!isValid) {
      throw new Error('Invalid JWT signature');
    }

    const payload = JSON.parse(this.base64UrlDecode(encodedPayload));

    // Verify issuer and audience if configured
    if (this.config.issuer && payload.iss !== this.config.issuer) {
      throw new Error('Invalid JWT issuer');
    }

    if (this.config.audience && payload.aud !== this.config.audience) {
      throw new Error('Invalid JWT audience');
    }

    return payload;
  }

  private sign(data: string, privateKey: string): string {
    const sign = createSign(this.config.algorithm);
    sign.update(data);
    return sign.sign(privateKey, 'base64');
  }

  private verify(data: string, signature: string, publicKey: string): boolean {
    const verify = createVerify(this.config.algorithm);
    verify.update(data);
    return verify.verify(publicKey, signature, 'base64');
  }

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private base64UrlDecode(str: string): string {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  }
}

