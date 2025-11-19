import { Logger } from './logger.js';

/**
 * Validation utilities
 */

/**
 * Validate SSH connection string format
 */
export function validateSSHConnection(connectionString: string): boolean {
  const regex = /^([^@]+)@([^:]+)(?::(\d+))?$/;
  
  if (!regex.test(connectionString)) {
    Logger.error(`Invalid SSH connection string: ${connectionString}`);
    Logger.info('Expected format: user@host or user@host:port');
    Logger.info('Examples:');
    Logger.log('  ubuntu@123.45.67.89');
    Logger.log('  ubuntu@myserver.com:2222');
    return false;
  }

  return true;
}

/**
 * Validate HTTP URL format
 */
export function validateHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      Logger.error(`Invalid URL protocol: ${parsed.protocol}`);
      Logger.info('Expected: http:// or https://');
      return false;
    }
    return true;
  } catch (error) {
    Logger.error(`Invalid URL format: ${url}`);
    Logger.info('Expected format: http://host:port/path');
    return false;
  }
}

/**
 * Validate environment name
 */
export function validateEnvironmentName(name: string): boolean {
  const regex = /^[a-zA-Z0-9_-]+$/;
  
  if (!regex.test(name)) {
    Logger.error(`Invalid environment name: ${name}`);
    Logger.info('Environment names can only contain: a-z, A-Z, 0-9, _, -');
    Logger.info('Examples: production, staging, dev, prod-eu');
    return false;
  }

  return true;
}

/**
 * Validate port number
 */
export function validatePort(port: number): boolean {
  if (port < 1 || port > 65535) {
    Logger.error(`Invalid port number: ${port}`);
    Logger.info('Port must be between 1 and 65535');
    return false;
  }

  if (port < 1024) {
    Logger.warn(`Port ${port} is privileged (< 1024) - may require sudo`);
  }

  return true;
}

/**
 * Validate Node.js version format
 */
export function validateNodeVersion(version: string): boolean {
  const regex = /^\d+(\.\d+)?(\.\d+)?$/;
  
  if (!regex.test(version)) {
    Logger.error(`Invalid Node.js version: ${version}`);
    Logger.info('Expected format: 18 or 18.19 or 18.19.0');
    return false;
  }

  const major = parseInt(version.split('.')[0]);
  if (major < 14) {
    Logger.warn(`Node.js ${version} is very old - consider using 18 or 20`);
  }

  return true;
}

/**
 * Validate application name
 */
export function validateAppName(name: string): boolean {
  const regex = /^[a-zA-Z0-9_-]+$/;
  
  if (!regex.test(name)) {
    Logger.error(`Invalid application name: ${name}`);
    Logger.info('Names can only contain: a-z, A-Z, 0-9, _, -');
    Logger.info('Examples: my-app, api_server, webapp-v2');
    return false;
  }

  if (name.length < 2) {
    Logger.error('Application name must be at least 2 characters');
    return false;
  }

  if (name.length > 50) {
    Logger.error('Application name must be less than 50 characters');
    return false;
  }

  return true;
}

/**
 * Validate remote directory path
 */
export function validateRemotePath(path: string): boolean {
  if (!path.startsWith('/')) {
    Logger.error(`Remote path must be absolute: ${path}`);
    Logger.info('Example: /var/www/my-app');
    return false;
  }

  if (path.includes('..')) {
    Logger.error('Remote path cannot contain ..');
    return false;
  }

  // Warn about dangerous paths
  const dangerousPaths = ['/', '/etc', '/bin', '/usr', '/var/log', '/root', '/home'];
  if (dangerousPaths.includes(path)) {
    Logger.error(`Refusing to deploy to system directory: ${path}`);
    Logger.info('Use a subdirectory like /var/www/my-app');
    return false;
  }

  return true;
}
