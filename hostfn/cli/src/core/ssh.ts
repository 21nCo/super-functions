import { Client, ConnectConfig } from 'ssh2';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { Logger } from '../utils/logger.js';

export interface SSHConnectionOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * SSH Connection Manager
 */
export class SSHConnection {
  private client: Client;
  private config: ConnectConfig;
  private connected: boolean = false;

  constructor(options: SSHConnectionOptions) {
    this.client = new Client();
    
    // Build SSH config
    this.config = {
      host: options.host,
      port: options.port || 22,
      username: options.username,
    };

    // Add authentication method
    if (options.password) {
      this.config.password = options.password;
    } else if (process.env.HOSTFN_SSH_KEY) {
      // CI/CD mode: Load key from environment variable
      try {
        this.config.privateKey = Buffer.from(
          process.env.HOSTFN_SSH_KEY,
          'base64'
        );
        if (options.passphrase || process.env.HOSTFN_SSH_PASSPHRASE) {
          this.config.passphrase = options.passphrase || process.env.HOSTFN_SSH_PASSPHRASE;
        }
      } catch (error) {
        throw new Error(
          `Failed to decode HOSTFN_SSH_KEY from environment variable\n` +
          `Make sure it's base64 encoded: cat ~/.ssh/id_rsa | base64`
        );
      }
    } else {
      // Enable SSH agent for passphrase-protected keys
      if (process.env.SSH_AUTH_SOCK) {
        this.config.agent = process.env.SSH_AUTH_SOCK;
      }
      
      // Try to load private key from file
      const keyPath = options.privateKeyPath || this.getDefaultKeyPath();
      try {
        this.config.privateKey = readFileSync(keyPath);
        if (options.passphrase) {
          this.config.passphrase = options.passphrase;
        }
      } catch (error) {
        throw new Error(
          `Failed to load SSH key from ${keyPath}\n` +
          `Make sure the file exists or set HOSTFN_SSH_KEY environment variable\n` +
          `For CI/CD: export HOSTFN_SSH_KEY=$(cat ~/.ssh/id_rsa | base64)`
        );
      }
    }
  }

  /**
   * Get default SSH key path (~/.ssh/id_rsa)
   */
  private getDefaultKeyPath(): string {
    const sshDir = resolve(homedir(), '.ssh');
    // Try common key names
    const keyNames = ['id_rsa', 'id_ed25519', 'id_ecdsa'];
    
    for (const keyName of keyNames) {
      const keyPath = resolve(sshDir, keyName);
      try {
        readFileSync(keyPath);
        return keyPath;
      } catch {
        continue;
      }
    }

    // Default to id_rsa even if it doesn't exist (will error later)
    return resolve(sshDir, 'id_rsa');
  }

  /**
   * Connect to SSH server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => {
          this.connected = true;
          resolve();
        })
        .on('error', (err) => {
          reject(new Error(`SSH connection failed: ${err.message}`));
        })
        .connect(this.config);
    });
  }

  /**
   * Execute command on remote server
   */
  async exec(command: string, options?: {
    streaming?: boolean;
    cwd?: string;
    skipNvmSetup?: boolean;
  }): Promise<SSHCommandResult> {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    // Source nvm to ensure Node.js/npm are in PATH for non-interactive sessions
    // Skip for setup scripts that install nvm
    const nvmSetup = options?.skipNvmSetup 
      ? ''
      : 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && ';
    
    // Add cd command if cwd provided
    const fullCommand = options?.cwd 
      ? `${nvmSetup}cd ${options.cwd} && ${command}`
      : `${nvmSetup}${command}`;

    return new Promise((resolve, reject) => {
      this.client.exec(fullCommand, (err, stream) => {
        if (err) {
          reject(new Error(`Failed to execute command: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            resolve({
              stdout,
              stderr,
              exitCode: code,
            });
          })
          .on('data', (data: Buffer) => {
            const output = data.toString();
            stdout += output;
            
            if (options?.streaming) {
              process.stdout.write(output);
            }
          })
          .stderr.on('data', (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            
            if (options?.streaming) {
              process.stderr.write(output);
            }
          });
      });
    });
  }

  /**
   * Upload file to remote server (SCP)
   */
  async uploadFile(
    localPath: string,
    remotePath: string
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(new Error(`SFTP session failed: ${err.message}`));
          return;
        }

        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) {
            reject(new Error(`Failed to upload file: ${err.message}`));
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Download file from remote server
   */
  async downloadFile(
    remotePath: string,
    localPath: string
  ): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(new Error(`SFTP session failed: ${err.message}`));
          return;
        }

        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) {
            reject(new Error(`Failed to download file: ${err.message}`));
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Check if file/directory exists on remote
   */
  async exists(remotePath: string): Promise<boolean> {
    try {
      const result = await this.exec(`test -e ${remotePath} && echo "exists"`);
      return result.stdout.trim() === 'exists';
    } catch {
      return false;
    }
  }

  /**
   * Create directory on remote server
   */
  async mkdir(remotePath: string, recursive: boolean = true): Promise<void> {
    const flag = recursive ? '-p' : '';
    const result = await this.exec(`mkdir ${flag} ${remotePath}`);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${result.stderr}`);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Parse SSH connection string (user@host)
 */
export function parseSSHConnection(connectionString: string): {
  username: string;
  host: string;
  port?: number;
} {
  // Support formats:
  // - user@host
  // - user@host:port
  const match = connectionString.match(/^([^@]+)@([^:]+)(?::(\d+))?$/);
  
  if (!match) {
    throw new Error(
      `Invalid SSH connection string: ${connectionString}\n` +
      `Expected format: user@host or user@host:port`
    );
  }

  return {
    username: match[1],
    host: match[2],
    port: match[3] ? parseInt(match[3]) : undefined,
  };
}

/**
 * Create SSH connection from connection string
 */
export async function createSSHConnection(
  connectionString: string,
  options?: {
    password?: string;
    privateKeyPath?: string;
    passphrase?: string;
  }
): Promise<SSHConnection> {
  // Support HOSTFN_HOST env var for CI/CD
  const hostToUse = process.env.HOSTFN_HOST || connectionString;
  const { username, host, port } = parseSSHConnection(hostToUse);
  
  const ssh = new SSHConnection({
    host,
    port,
    username,
    password: options?.password || process.env.HOSTFN_SSH_PASSWORD,
    privateKeyPath: options?.privateKeyPath,
    passphrase: options?.passphrase || process.env.HOSTFN_SSH_PASSPHRASE,
  });

  await ssh.connect();
  return ssh;
}
