import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateInteractionResponse, getInteractionOption } from '../../src/utils';

describe('Discord Utils', () => {
  describe('updateInteractionResponse', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should successfully update interaction response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      await updateInteractionResponse('client123', 'token456', 'Updated message');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/v10/webhooks/client123/token456/messages/@original',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Updated message' }),
        }
      );
    });

    it('should throw error when response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = mockFetch;

      await expect(
        updateInteractionResponse('client123', 'token456', 'Failed message')
      ).rejects.toThrow('Failed to update Discord interaction response: 404');
    });

    it('should handle 401 unauthorized error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      global.fetch = mockFetch;

      await expect(
        updateInteractionResponse('client123', 'invalid-token', 'Message')
      ).rejects.toThrow('Failed to update Discord interaction response: 401');
    });

    it('should handle 500 server error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      global.fetch = mockFetch;

      await expect(
        updateInteractionResponse('client123', 'token456', 'Message')
      ).rejects.toThrow('Failed to update Discord interaction response: 500');
    });
  });

  describe('getInteractionOption', () => {
    it('should return option value by name', () => {
      const options = [
        { name: 'repository', value: 'owner/repo' },
        { name: 'search', value: 'bug' },
      ];

      const result = getInteractionOption(options, 'repository');
      expect(result).toBe('owner/repo');
    });

    it('should return undefined when option not found', () => {
      const options = [
        { name: 'repository', value: 'owner/repo' },
      ];

      const result = getInteractionOption(options, 'missing');
      expect(result).toBeUndefined();
    });

    it('should return undefined when options array is undefined', () => {
      const result = getInteractionOption(undefined, 'repository');
      expect(result).toBeUndefined();
    });

    it('should return undefined when options array is empty', () => {
      const result = getInteractionOption([], 'repository');
      expect(result).toBeUndefined();
    });

    it('should handle number values', () => {
      const options = [
        { name: 'count', value: 42 },
      ];

      const result = getInteractionOption<number>(options, 'count');
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should handle boolean values', () => {
      const options = [
        { name: 'enabled', value: true },
      ];

      const result = getInteractionOption<boolean>(options, 'enabled');
      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    it('should return first match when multiple options have same name', () => {
      const options = [
        { name: 'duplicate', value: 'first' },
        { name: 'duplicate', value: 'second' },
      ];

      const result = getInteractionOption(options, 'duplicate');
      expect(result).toBe('first');
    });

    it('should handle empty string values', () => {
      const options = [
        { name: 'empty', value: '' },
      ];

      const result = getInteractionOption(options, 'empty');
      expect(result).toBe('');
    });
  });
});
