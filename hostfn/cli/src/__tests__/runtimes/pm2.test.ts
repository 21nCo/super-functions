import { describe, it, expect } from 'vitest';
import { PM2Manager } from '../../runtimes/nodejs/pm2.js';
import { RuntimeConfig } from '../../runtimes/base.js';

describe('PM2Manager', () => {
  const pm2Manager = new PM2Manager();

  describe('generateEcosystemConfig', () => {
    it('should generate valid ecosystem config with env_file', () => {
      const config: RuntimeConfig = {
        name: 'test-app',
        runtime: 'nodejs',
        version: '18',
        start: {
          command: 'npm start',
          entry: 'dist/index.js',
        },
        port: 3000,
      };

      const result = pm2Manager.generateEcosystemConfig(config, 'production');

      expect(result).toContain("name: 'test-app-production'");
      expect(result).toContain("script: 'dist/index.js'");
      // Implementation uses inline env with double quotes (JSON.stringify)
      expect(result).toContain('NODE_ENV: "production"');
      expect(result).toContain('PORT: 3000');
      expect(result).toContain("instances: 'max'");
      expect(result).toContain("exec_mode: 'cluster'");
    });

    it('should use default entry if not specified', () => {
      const config: RuntimeConfig = {
        name: 'test-app',
        runtime: 'nodejs',
        version: '18',
        start: {
          command: 'npm start',
        },
        port: 3000,
      };

      const result = pm2Manager.generateEcosystemConfig(config, 'staging');

      expect(result).toContain("script: 'dist/index.js'");
      expect(result).toContain("name: 'test-app-staging'");
    });

    it('should include error and output log paths', () => {
      const config: RuntimeConfig = {
        name: 'test-app',
        runtime: 'nodejs',
        version: '18',
        start: {
          command: 'npm start',
          entry: 'dist/server.js',
        },
        port: 8080,
      };

      const result = pm2Manager.generateEcosystemConfig(config, 'dev');

      expect(result).toContain("error_file: './logs/err.log'");
      expect(result).toContain("out_file: './logs/out.log'");
    });

    it('should include auto-restart and memory limits', () => {
      const config: RuntimeConfig = {
        name: 'test-app',
        runtime: 'nodejs',
        version: '18',
        start: {
          command: 'npm start',
        },
        port: 3000,
      };

      const result = pm2Manager.generateEcosystemConfig(config, 'production');

      expect(result).toContain('autorestart: true');
      expect(result).toContain('max_restarts: 10');
      expect(result).toContain("min_uptime: '10s'");
      expect(result).toContain("max_memory_restart: '1G'");
    });
  });

  describe('generateReloadCommand', () => {
    it('should generate reload command with update-env flag', () => {
      const result = pm2Manager.generateReloadCommand('my-app-production');
      expect(result).toBe('pm2 reload my-app-production --update-env');
    });
  });

  describe('generateStartCommand', () => {
    it('should generate start command', () => {
      const config: RuntimeConfig = {
        name: 'test-app',
        runtime: 'nodejs',
        version: '18',
        start: {
          command: 'npm start',
          entry: 'dist/index.js',
        },
        port: 3000,
      };

      const result = pm2Manager.generateStartCommand(config, 'production');
      expect(result).toBe('pm2 start dist/index.js --name test-app-production -i max --env production');
    });
  });

  describe('generateStopCommand', () => {
    it('should generate stop command', () => {
      const result = pm2Manager.generateStopCommand('my-app-production');
      expect(result).toBe('pm2 stop my-app-production');
    });
  });

  describe('generateLogsCommand', () => {
    it('should generate logs command with default lines', () => {
      const result = pm2Manager.generateLogsCommand('my-app-production');
      expect(result).toBe('pm2 logs my-app-production --lines 100');
    });

    it('should generate logs command with custom lines', () => {
      const result = pm2Manager.generateLogsCommand('my-app-production', 500);
      expect(result).toBe('pm2 logs my-app-production --lines 500');
    });
  });
});
