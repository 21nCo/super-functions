import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthCheck } from '../../core/health.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('HealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('check', () => {
    it('should return healthy for successful response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await HealthCheck.check({
        url: 'http://localhost:3000/health',
      });

      expect(result.healthy).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy for failed response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await HealthCheck.check({
        url: 'http://localhost:3000/health',
      });

      expect(result.healthy).toBe(false);
      expect(result.statusCode).toBe(500);
    });

    it('should return unhealthy for network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await HealthCheck.check({
        url: 'http://localhost:3000/health',
      });

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should respect timeout', async () => {
      (global.fetch as any).mockImplementationOnce(() =>
        new Promise((resolve) => setTimeout(resolve, 2000))
      );

      const result = await HealthCheck.check({
        url: 'http://localhost:3000/health',
        timeout: 100,
      });

      expect(result.healthy).toBe(false);
    });
  });

  describe('waitForReady', () => {
    it('should return true when service becomes healthy', async () => {
      let callCount = 0;
      (global.fetch as any).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: callCount >= 2, // Becomes healthy on second call
          status: callCount >= 2 ? 200 : 503,
        });
      });

      const result = await HealthCheck.waitForReady({
        url: 'http://localhost:3000/health',
        retries: 5,
        interval: 10,
      });

      expect(result).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('should return false when max retries exceeded', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
      });

      const result = await HealthCheck.waitForReady({
        url: 'http://localhost:3000/health',
        retries: 2,
        interval: 10,
      });

      expect(result).toBe(false);
    });

    it('should call progress callback on each attempt', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
      });

      const progressCalls: number[] = [];

      await HealthCheck.waitForReady(
        {
          url: 'http://localhost:3000/health',
          retries: 3,
          interval: 10,
        },
        (attempt) => {
          progressCalls.push(attempt);
        }
      );

      expect(progressCalls).toEqual([1, 2, 3]);
    });
  });
});
