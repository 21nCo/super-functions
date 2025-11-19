import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateSSHConnection,
  validateHttpUrl,
  validateEnvironmentName,
  validatePort,
  validateNodeVersion,
  validateAppName,
  validateRemotePath,
} from '../../utils/validation.js';

// Mock Logger to prevent console output during tests
vi.mock('../../utils/logger.js', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
  },
}));

describe('Validation Utilities', () => {
  describe('validateSSHConnection', () => {
    it('should accept valid SSH connection strings', () => {
      expect(validateSSHConnection('user@host')).toBe(true);
      expect(validateSSHConnection('ubuntu@123.45.67.89')).toBe(true);
      expect(validateSSHConnection('user@server.com')).toBe(true);
      expect(validateSSHConnection('user@host:2222')).toBe(true);
    });

    it('should reject invalid SSH connection strings', () => {
      expect(validateSSHConnection('invalid')).toBe(false);
      expect(validateSSHConnection('user')).toBe(false);
      expect(validateSSHConnection('@host')).toBe(false);
      expect(validateSSHConnection('user@')).toBe(false);
      expect(validateSSHConnection('user@host:abc')).toBe(false);
    });
  });

  describe('validateHttpUrl', () => {
    it('should accept valid HTTP/HTTPS URLs', () => {
      expect(validateHttpUrl('http://localhost:3000')).toBe(true);
      expect(validateHttpUrl('https://example.com')).toBe(true);
      expect(validateHttpUrl('http://123.45.67.89:8080/health')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateHttpUrl('ftp://example.com')).toBe(false);
      expect(validateHttpUrl('not-a-url')).toBe(false);
      expect(validateHttpUrl('example.com')).toBe(false);
    });
  });

  describe('validateEnvironmentName', () => {
    it('should accept valid environment names', () => {
      expect(validateEnvironmentName('production')).toBe(true);
      expect(validateEnvironmentName('staging')).toBe(true);
      expect(validateEnvironmentName('dev')).toBe(true);
      expect(validateEnvironmentName('prod-eu')).toBe(true);
      expect(validateEnvironmentName('test_env')).toBe(true);
      expect(validateEnvironmentName('env123')).toBe(true);
    });

    it('should reject invalid environment names', () => {
      expect(validateEnvironmentName('prod space')).toBe(false);
      expect(validateEnvironmentName('prod@env')).toBe(false);
      expect(validateEnvironmentName('prod.env')).toBe(false);
      expect(validateEnvironmentName('prod/env')).toBe(false);
    });
  });

  describe('validatePort', () => {
    it('should accept valid port numbers', () => {
      expect(validatePort(3000)).toBe(true);
      expect(validatePort(8080)).toBe(true);
      expect(validatePort(65535)).toBe(true);
    });

    it('should warn about privileged ports', () => {
      expect(validatePort(80)).toBe(true);
      expect(validatePort(443)).toBe(true);
      expect(validatePort(22)).toBe(true);
    });

    it('should reject invalid port numbers', () => {
      expect(validatePort(0)).toBe(false);
      expect(validatePort(-1)).toBe(false);
      expect(validatePort(65536)).toBe(false);
      expect(validatePort(99999)).toBe(false);
    });
  });

  describe('validateNodeVersion', () => {
    it('should accept valid Node.js versions', () => {
      expect(validateNodeVersion('18')).toBe(true);
      expect(validateNodeVersion('18.19')).toBe(true);
      expect(validateNodeVersion('18.19.0')).toBe(true);
      expect(validateNodeVersion('20')).toBe(true);
    });

    it('should warn about old versions', () => {
      expect(validateNodeVersion('12')).toBe(true);
      expect(validateNodeVersion('10.0.0')).toBe(true);
    });

    it('should reject invalid version formats', () => {
      expect(validateNodeVersion('v18')).toBe(false);
      expect(validateNodeVersion('18.x')).toBe(false);
      expect(validateNodeVersion('latest')).toBe(false);
      expect(validateNodeVersion('18.19.0.1')).toBe(false);
    });
  });

  describe('validateAppName', () => {
    it('should accept valid application names', () => {
      expect(validateAppName('my-app')).toBe(true);
      expect(validateAppName('api_server')).toBe(true);
      expect(validateAppName('webapp123')).toBe(true);
      expect(validateAppName('MyApp')).toBe(true);
    });

    it('should reject too short names', () => {
      expect(validateAppName('a')).toBe(false);
      expect(validateAppName('')).toBe(false);
    });

    it('should reject too long names', () => {
      expect(validateAppName('a'.repeat(51))).toBe(false);
    });

    it('should reject invalid characters', () => {
      expect(validateAppName('my app')).toBe(false);
      expect(validateAppName('my@app')).toBe(false);
      expect(validateAppName('my.app')).toBe(false);
    });
  });

  describe('validateRemotePath', () => {
    it('should accept valid remote paths', () => {
      expect(validateRemotePath('/var/www/my-app')).toBe(true);
      expect(validateRemotePath('/opt/apps/webapp')).toBe(true);
      expect(validateRemotePath('/home/user/app')).toBe(true);
    });

    it('should reject relative paths', () => {
      expect(validateRemotePath('var/www/app')).toBe(false);
      expect(validateRemotePath('./app')).toBe(false);
      expect(validateRemotePath('../app')).toBe(false);
    });

    it('should reject paths with .. traversal', () => {
      expect(validateRemotePath('/var/www/../app')).toBe(false);
    });

    it('should reject dangerous system paths', () => {
      expect(validateRemotePath('/')).toBe(false);
      expect(validateRemotePath('/etc')).toBe(false);
      expect(validateRemotePath('/bin')).toBe(false);
      expect(validateRemotePath('/usr')).toBe(false);
      expect(validateRemotePath('/root')).toBe(false);
      expect(validateRemotePath('/home')).toBe(false);
    });
  });
});
