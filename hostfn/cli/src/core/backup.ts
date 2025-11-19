import { SSHConnection } from './ssh.js';
import { Logger } from '../utils/logger.js';

export interface BackupOptions {
  keep?: number;
}

/**
 * Backup manager for deployments
 */
export class BackupManager {
  private ssh: SSHConnection;
  private appDir: string;
  private backupDir: string;

  constructor(ssh: SSHConnection, appDir: string) {
    this.ssh = ssh;
    this.appDir = appDir;
    this.backupDir = `${appDir}/backups`;
  }

  /**
   * Create backup of current deployment
   */
  async create(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.backupDir}/${timestamp}`;

    // Create backup directory if it doesn't exist
    await this.ssh.mkdir(this.backupDir, true);

    // Check if there's anything to backup
    const distExists = await this.ssh.exists(`${this.appDir}/dist`);
    
    if (!distExists) {
      Logger.warn('No existing deployment to backup');
      return backupPath;
    }

    // Create backup
    const result = await this.ssh.exec(
      `mkdir -p ${backupPath} && ` +
      `cp -r ${this.appDir}/dist ${backupPath}/ && ` +
      `cp ${this.appDir}/package.json ${backupPath}/ 2>/dev/null || true`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create backup: ${result.stderr}`);
    }

    return backupPath;
  }

  /**
   * List all backups
   */
  async list(): Promise<string[]> {
    const exists = await this.ssh.exists(this.backupDir);
    
    if (!exists) {
      return [];
    }

    const result = await this.ssh.exec(`ls -1 ${this.backupDir}`);
    
    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .sort()
      .reverse(); // Most recent first
  }

  /**
   * Restore from backup
   */
  async restore(backupName: string): Promise<void> {
    const backupPath = `${this.backupDir}/${backupName}`;
    
    // Check if backup exists
    const exists = await this.ssh.exists(backupPath);
    
    if (!exists) {
      throw new Error(`Backup not found: ${backupName}`);
    }

    // Restore
    const result = await this.ssh.exec(
      `rm -rf ${this.appDir}/dist && ` +
      `cp -r ${backupPath}/dist ${this.appDir}/`
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to restore backup: ${result.stderr}`);
    }
  }

  /**
   * Clean up old backups (keep only last N)
   */
  async cleanup(keep: number = 5): Promise<void> {
    const backups = await this.list();

    if (backups.length <= keep) {
      return; // Nothing to clean up
    }

    const toDelete = backups.slice(keep);

    for (const backup of toDelete) {
      await this.ssh.exec(`rm -rf ${this.backupDir}/${backup}`);
    }

    Logger.info(`Cleaned up ${toDelete.length} old backup(s)`);
  }

  /**
   * Get most recent backup
   */
  async getLatest(): Promise<string | null> {
    const backups = await this.list();
    return backups.length > 0 ? backups[0] : null;
  }
}
