import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupManager } from '../../core/backup.js';

// Mock SSH connection
const mockSSH = {
  exec: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  disconnect: vi.fn(),
};

describe('BackupManager', () => {
  let backupManager: BackupManager;

  beforeEach(() => {
    vi.clearAllMocks();
    backupManager = new BackupManager(mockSSH as any, '/var/www/myapp');
  });

  describe('create', () => {
    it('should create backup with timestamp', async () => {
      mockSSH.mkdir.mockResolvedValue(undefined);
      mockSSH.exists.mockResolvedValue(true);  // dist exists
      mockSSH.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      
      const backupPath = await backupManager.create();
      
      expect(backupPath).toMatch(/\/var\/www\/myapp\/backups\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
      expect(mockSSH.mkdir).toHaveBeenCalled();
      expect(mockSSH.exec).toHaveBeenCalled();
    });

    it('should return path even if source directory does not exist', async () => {
      mockSSH.mkdir.mockResolvedValue(undefined);
      mockSSH.exists.mockResolvedValue(false);  // No dist directory
      
      const backupPath = await backupManager.create();
      
      // Returns backup path but doesn't fail
      expect(backupPath).toMatch(/\/var\/www\/myapp\/backups\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
      expect(mockSSH.mkdir).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should list all backups with timestamps', async () => {
      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec.mockResolvedValue({ 
        stdout: 'myapp.backup.20251114_130000\nmyapp.backup.20251114_120000\n',  // sorted reverse
        stderr: '', 
        exitCode: 0 
      });
      
      const backups = await backupManager.list();
      
      expect(backups).toHaveLength(2);
      expect(backups[0]).toContain('20251114_130000');  // Most recent first
      expect(backups[1]).toContain('20251114_120000');
    });

    it('should return empty array when no backups exist', async () => {
      mockSSH.exec.mockResolvedValue({ 
        stdout: '', 
        stderr: '', 
        exitCode: 0 
      });
      
      const backups = await backupManager.list();
      
      expect(backups).toHaveLength(0);
    });
  });

  describe('restore', () => {
    it('should restore from backup', async () => {
      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      
      await backupManager.restore('myapp.backup.20251114_120000');
      
      expect(mockSSH.exec).toHaveBeenCalledWith(
        expect.stringContaining('cp -r')
      );
    });
  });

  describe('cleanup', () => {
    it('should keep only specified number of backups', async () => {
      const backupNames = [
        'myapp.backup.20251114_150000',  // Most recent (sorted)
        'myapp.backup.20251114_140000',
        'myapp.backup.20251114_130000',
        'myapp.backup.20251114_120000',
        'myapp.backup.20251114_110000',
        'myapp.backup.20251114_100000',  // Oldest
      ];

      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec
        .mockResolvedValueOnce({ 
          stdout: backupNames.join('\n'), 
          stderr: '', 
          exitCode: 0 
        })
        .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      
      await backupManager.cleanup(3);
      
      // Should remove oldest 3 backups
      expect(mockSSH.exec).toHaveBeenCalledWith(
        expect.stringContaining('rm -rf')
      );
    });

    it('should not remove backups if under limit', async () => {
      const backupNames = [
        'myapp.backup.20251114_100000',
        'myapp.backup.20251114_110000',
      ];

      mockSSH.exists.mockResolvedValue(true);
      mockSSH.exec.mockResolvedValueOnce({ 
        stdout: backupNames.join('\n'), 
        stderr: '', 
        exitCode: 0 
      });
      
      await backupManager.cleanup(5);
      
      // Should only call list, not remove (called twice: exists + ls)
      expect(mockSSH.exec).toHaveBeenCalledTimes(1);
      expect(mockSSH.exec).toHaveBeenCalledWith(expect.stringContaining('ls -1'));
    });
  });
});
