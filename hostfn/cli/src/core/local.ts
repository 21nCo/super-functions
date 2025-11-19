import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

const execAsync = promisify(exec);

export interface LocalCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class LocalExecutor {
  async connect(): Promise<void> {
    return Promise.resolve();
  }

  async exec(command: string, options?: {
    streaming?: boolean;
    cwd?: string;
  }): Promise<LocalCommandResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options?.cwd,
        shell: '/bin/bash',
      });

      return {
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
      };
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const { copyFileSync } = await import('fs');
    copyFileSync(localPath, remotePath);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const { copyFileSync } = await import('fs');
    copyFileSync(remotePath, localPath);
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async mkdir(path: string, recursive: boolean = true): Promise<void> {
    await mkdir(path, { recursive });
  }

  isConnected(): boolean {
    return true;
  }

  disconnect(): void {
  }
}
