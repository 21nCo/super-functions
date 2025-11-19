import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LockManager } from '../../core/lock.js';

// Mock SSH connection
const mockSSH = {
  exec: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  disconnect: vi.fn(),
};

// Mock Logger to prevent console output
vi.mock('../../utils/logger.js', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    br: vi.fn(),
  },
}));

describe('LockManager', () => {
  let lockManager: LockManager;

  beforeEach(() => {
    vi.clearAllMocks();
    lockManager = new LockManager(mockSSH as any, '/var/www/myapp');
  });

  describe('acquire', () => {
    it('should acquire lock when no lock exists', async () => {
      mockSSH.exists.mockResolvedValue(false);
      mockSSH.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      
      const acquired = await lockManager.acquire();
      
      expect(acquired).toBe(true);
      expect(mockSSH.exec).toHaveBeenCalledWith(
        expect.stringContaining('.hostfn-deploy.lock')
      );
    });

    it('should fail when valid lock exists', async () => {
      const recentLock = {
        pid: 12345,
        user: 'developer',
        timestamp: Date.now() - 60000, // 1 minute ago
        hostname: 'laptop',
      };

      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec.mockResolvedValue({ 
        stdout: JSON.stringify(recentLock), 
        stderr: '', 
        exitCode: 0 
      });
      
      const acquired = await lockManager.acquire();
      
      expect(acquired).toBe(false);
    });

    it('should acquire lock when stale lock exists', async () => {
      const staleLock = {
        pid: 12345,
        user: 'developer',
        timestamp: Date.now() - 400000, // 6+ minutes ago (stale)
        hostname: 'laptop',
      };

      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec
        .mockResolvedValueOnce({ 
          stdout: JSON.stringify(staleLock), 
          stderr: '', 
          exitCode: 0 
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // release
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // acquire
      
      const acquired = await lockManager.acquire();
      
      expect(acquired).toBe(true);
    });

    it('should acquire lock when invalid lock file exists', async () => {
      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec
        .mockResolvedValueOnce({ 
          stdout: 'invalid json', 
          stderr: '', 
          exitCode: 0 
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // release
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // acquire
      
      const acquired = await lockManager.acquire();
      
      expect(acquired).toBe(true);
    });
  });

  describe('release', () => {
    it('should remove lock file', async () => {
      mockSSH.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      
      await lockManager.release();
      
      expect(mockSSH.exec).toHaveBeenCalledWith(
        expect.stringContaining('rm -f')
      );
    });

    it('should not throw on release error', async () => {
      mockSSH.exec.mockRejectedValue(new Error('File not found'));
      
      await expect(lockManager.release()).resolves.not.toThrow();
    });
  });

  describe('isLocked', () => {
    it('should return false when no lock exists', async () => {
      mockSSH.exists.mockResolvedValue(false);
      
      const locked = await lockManager.isLocked();
      
      expect(locked).toBe(false);
    });

    it('should return true when valid lock exists', async () => {
      const recentLock = {
        pid: 12345,
        user: 'developer',
        timestamp: Date.now() - 60000, // 1 minute ago
        hostname: 'laptop',
      };

      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec.mockResolvedValue({ 
        stdout: JSON.stringify(recentLock), 
        stderr: '', 
        exitCode: 0 
      });
      
      const locked = await lockManager.isLocked();
      
      expect(locked).toBe(true);
    });

    it('should return false when stale lock exists', async () => {
      const staleLock = {
        pid: 12345,
        user: 'developer',
        timestamp: Date.now() - 400000, // 6+ minutes ago (stale)
        hostname: 'laptop',
      };

      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec.mockResolvedValue({ 
        stdout: JSON.stringify(staleLock), 
        stderr: '', 
        exitCode: 0 
      });
      
      const locked = await lockManager.isLocked();
      
      expect(locked).toBe(false);
    });
  });
});
