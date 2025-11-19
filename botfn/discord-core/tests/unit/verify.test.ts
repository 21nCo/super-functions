import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyDiscordRequest } from '../../src/verify';

describe('verifyDiscordRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return isValid false when signature header is missing', async () => {
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature-timestamp': '1234567890',
      },
      body: JSON.stringify({ type: 1 }),
    });

    const result = await verifyDiscordRequest(mockRequest, 'any-public-key');

    expect(result.isValid).toBe(false);
    expect(result.body).toBeUndefined();
  });

  it('should return isValid false when timestamp header is missing', async () => {
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature-ed25519': 'some-signature',
      },
      body: JSON.stringify({ type: 1 }),
    });

    const result = await verifyDiscordRequest(mockRequest, 'any-public-key');

    expect(result.isValid).toBe(false);
    expect(result.body).toBeUndefined();
  });

  it('should return isValid false when both headers are missing', async () => {
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify({ type: 1 }),
    });

    const result = await verifyDiscordRequest(mockRequest, 'any-public-key');

    expect(result.isValid).toBe(false);
    expect(result.body).toBeUndefined();
  });

  it('should return isValid true and parsed body when verification succeeds', async () => {
    const body = { type: 1, id: '123', token: 'test-token' };
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature-ed25519': 'aabbccdd',
        'x-signature-timestamp': '1234567890',
      },
      body: JSON.stringify(body),
    });

    // Mock crypto.subtle methods using vi.spyOn
    const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    const verifySpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);

    const result = await verifyDiscordRequest(mockRequest, 'aabbccdd11223344');

    expect(result.isValid).toBe(true);
    expect(result.body).toEqual(body);

    // Restore
    importKeySpy.mockRestore();
    verifySpy.mockRestore();
  });

  it('should return isValid false when crypto verification fails', async () => {
    const body = { type: 1 };
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature-ed25519': 'invalid-signature',
        'x-signature-timestamp': '1234567890',
      },
      body: JSON.stringify(body),
    });

    // Mock crypto.subtle methods using vi.spyOn
    const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    const verifySpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(false);

    const result = await verifyDiscordRequest(mockRequest, 'aabbccdd11223344');

    expect(result.isValid).toBe(false);
    expect(result.body).toBeUndefined();

    // Restore
    importKeySpy.mockRestore();
    verifySpy.mockRestore();
  });

  it('should handle crypto errors gracefully', async () => {
    const body = { type: 1 };
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature-ed25519': 'bad-hex',
        'x-signature-timestamp': '1234567890',
      },
      body: JSON.stringify(body),
    });

    // Mock crypto.subtle methods to throw errors
    const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(new Error('Crypto error'));

    const result = await verifyDiscordRequest(mockRequest, 'aabbccdd11223344');

    expect(result.isValid).toBe(false);
    expect(result.body).toBeUndefined();

    // Restore
    importKeySpy.mockRestore();
  });

  it('should handle malformed JSON body gracefully', async () => {
    const mockRequest = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'x-signature-ed25519': 'aabbccdd',
        'x-signature-timestamp': '1234567890',
      },
      body: 'not-valid-json',
    });

    // Mock crypto.subtle methods using vi.spyOn
    const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    const verifySpy = vi.spyOn(crypto.subtle, 'verify').mockResolvedValue(true);

    // The function catches JSON parse errors and returns isValid: false
    const result = await verifyDiscordRequest(mockRequest, 'aabbccdd11223344');
    
    // Since verification passes but JSON parse fails, it should return false
    expect(result.isValid).toBe(false);
    expect(result.body).toBeUndefined();

    // Restore
    importKeySpy.mockRestore();
    verifySpy.mockRestore();
  });
});
