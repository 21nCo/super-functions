import { SSHConnection } from './ssh.js';
import { Logger } from '../utils/logger.js';

export interface DeploymentLock {
  pid: number;
  user: string;
  timestamp: number;
  hostname: string;
}

/**
 * Deployment lock manager to prevent concurrent deployments
 */
export class LockManager {
  private ssh: SSHConnection;
  private lockFile: string;

  constructor(ssh: SSHConnection, remoteDir: string) {
    this.ssh = ssh;
    this.lockFile = `${remoteDir}/.hostfn-deploy.lock`;
  }

  /**
   * Acquire deployment lock
   */
  async acquire(timeout: number = 300): Promise<boolean> {
    // Check if lock exists
    const exists = await this.ssh.exists(this.lockFile);

    if (exists) {
      // Read lock info
      const result = await this.ssh.exec(`cat ${this.lockFile}`);
      
      try {
        const lock: DeploymentLock = JSON.parse(result.stdout);
        const age = Date.now() - lock.timestamp;

        // Check if lock is stale (older than timeout)
        if (age > timeout * 1000) {
          Logger.warn('Found stale lock file, removing...');
          await this.release();
        } else {
          const ageMinutes = Math.round(age / 1000 / 60);
          Logger.error('Deployment is already in progress');
          Logger.info(`Started by: ${lock.user}`);
          Logger.info(`Started at: ${new Date(lock.timestamp).toLocaleString()}`);
          Logger.info(`Age: ${ageMinutes} minute(s)`);
          Logger.br();
          Logger.warn('Wait for the current deployment to finish or:');
          Logger.log('  1. Wait for lock to expire (5 minutes)');
          Logger.log('  2. Manually remove: ssh <host> rm ' + this.lockFile);
          return false;
        }
      } catch {
        // Invalid lock file, remove it
        await this.release();
      }
    }

    // Create lock
    const lock: DeploymentLock = {
      pid: process.pid,
      user: process.env.USER || 'unknown',
      timestamp: Date.now(),
      hostname: process.env.HOSTNAME || 'unknown',
    };

    await this.ssh.exec(`cat > ${this.lockFile} << 'LOCKEOF'
${JSON.stringify(lock, null, 2)}
LOCKEOF`);

    return true;
  }

  /**
   * Release deployment lock
   */
  async release(): Promise<void> {
    await this.ssh.exec(`rm -f ${this.lockFile}`).catch(() => {
      // Ignore errors on cleanup
    });
  }

  /**
   * Check if deployment is locked
   */
  async isLocked(): Promise<boolean> {
    const exists = await this.ssh.exists(this.lockFile);
    
    if (!exists) {
      return false;
    }

    // Check if lock is stale
    const result = await this.ssh.exec(`cat ${this.lockFile}`);
    
    try {
      const lock: DeploymentLock = JSON.parse(result.stdout);
      const age = Date.now() - lock.timestamp;
      
      // Lock is stale if older than 5 minutes
      return age < 300 * 1000;
    } catch {
      // Invalid lock file = not locked
      return false;
    }
  }
}
