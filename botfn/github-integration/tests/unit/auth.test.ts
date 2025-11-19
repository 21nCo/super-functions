import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGitHubAppToken } from '../../src/auth';

describe('GitHub Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitHubAppToken', () => {
    const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0bJKEswGBRpxhALqd9tBnVzLCt8
-----END RSA PRIVATE KEY-----`;

    it('should successfully get GitHub App token', async () => {
      const mockToken = 'ghs_test123abc';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: mockToken }),
      });
      global.fetch = mockFetch;

      // Mock crypto operations for RSA JWT signing
      const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
      const signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

      const result = await getGitHubAppToken('123', '456', mockPrivateKey);

      expect(result).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/app/installations/456/access_tokens',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Discord-GitHub-Bot',
          }),
        })
      );

      // Restore
      importKeySpy.mockRestore();
      signSpy.mockRestore();
    });

    it('should throw error when API request fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      global.fetch = mockFetch;

      // Mock crypto operations
      const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
      const signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

      await expect(
        getGitHubAppToken('123', '456', mockPrivateKey)
      ).rejects.toThrow('Failed to get GitHub App token: 401');

      // Restore
      importKeySpy.mockRestore();
      signSpy.mockRestore();
    });

    it('should throw error with 404 for invalid installation', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = mockFetch;

      // Mock crypto operations
      const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
      const signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

      await expect(
        getGitHubAppToken('123', '999', mockPrivateKey)
      ).rejects.toThrow('Failed to get GitHub App token: 404');

      // Restore
      importKeySpy.mockRestore();
      signSpy.mockRestore();
    });

    it('should include JWT in Authorization header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'ghs_token' }),
      });
      global.fetch = mockFetch;

      // Mock crypto operations
      const importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
      const signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

      await getGitHubAppToken('123', '456', mockPrivateKey);

      const [, { headers }] = mockFetch.mock.calls[0];
      
      expect(headers.Authorization).toMatch(/^Bearer /);

      // Restore
      importKeySpy.mockRestore();
      signSpy.mockRestore();
    });
  });
});
