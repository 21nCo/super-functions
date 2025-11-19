import { execa } from 'execa';
import { Logger } from '../utils/logger.js';

export interface SyncOptions {
  exclude?: string[];
  include?: string[];
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Sync files to remote server using rsync
 */
export class FileSync {
  /**
   * Sync local directory to remote server
   */
  static async sync(
    localPath: string,
    remotePath: string,
    sshConnection: string, // user@host
    options: SyncOptions = {}
  ): Promise<void> {
    const args = [
      '-avz', // archive, verbose, compress
      '--delete', // delete files on remote that don't exist locally
    ];

    // Handle SSH authentication for CI/CD mode
    let tempKeyPath: string | undefined;
    if (process.env.HOSTFN_SSH_KEY) {
      // CI/CD mode: create temporary key file from base64-encoded env var
      const { writeFileSync, mkdtempSync } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      
      const tempDir = mkdtempSync(join(tmpdir(), 'hostfn-ssh-'));
      tempKeyPath = join(tempDir, 'id_rsa');
      
      // Decode and write the SSH key
      const keyBuffer = Buffer.from(process.env.HOSTFN_SSH_KEY, 'base64');
      writeFileSync(tempKeyPath, keyBuffer, { mode: 0o600 });
      
      // Build SSH command with the temporary key
      const sshCmd = `ssh -i ${tempKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes`;
      args.push('-e', sshCmd);
    } else {
      // Local mode: use default SSH config (respects ~/.ssh/config and ssh-agent)
      args.push('-e', 'ssh -o StrictHostKeyChecking=no -o BatchMode=yes');
    }

    // Add dry-run flag
    if (options.dryRun) {
      args.push('--dry-run');
    }

    // Add exclude patterns
    if (options.exclude && options.exclude.length > 0) {
      for (const pattern of options.exclude) {
        args.push('--exclude', pattern);
      }
    }

    // Add include patterns
    if (options.include && options.include.length > 0) {
      for (const pattern of options.include) {
        args.push('--include', pattern);
      }
    }

    // Ensure trailing slash on source (rsync behavior)
    const source = localPath.endsWith('/') ? localPath : `${localPath}/`;
    const destination = `${sshConnection}:${remotePath}`;

    args.push(source, destination);

    try {
      const result = await execa('rsync', args, {
        stdio: options.verbose ? 'inherit' : 'pipe',
      });

      if (result.exitCode !== 0) {
        throw new Error(`rsync failed with exit code ${result.exitCode}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        // Check if rsync is not installed
        if (error.message.includes('ENOENT') || error.message.includes('not found')) {
          throw new Error(
            'rsync is not installed on your system.\n' +
            'Please install it:\n' +
            '  - macOS: brew install rsync\n' +
            '  - Ubuntu/Debian: apt-get install rsync\n' +
            '  - Windows: Install via WSL or use Git Bash'
          );
        }
      }
      throw error;
    } finally {
      // Cleanup temporary key file if it was created
      if (tempKeyPath) {
        try {
          const { unlinkSync, rmdirSync } = await import('fs');
          const { dirname } = await import('path');
          unlinkSync(tempKeyPath);
          rmdirSync(dirname(tempKeyPath));
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Check if rsync is available
   */
  static async isRsyncAvailable(): Promise<boolean> {
    try {
      await execa('rsync', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get rsync version
   */
  static async getRsyncVersion(): Promise<string> {
    try {
      const result = await execa('rsync', ['--version']);
      const match = result.stdout.match(/rsync\s+version\s+([\d.]+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'not installed';
    }
  }
}
