#!/usr/bin/env node

import { Command } from 'commander';
import { Logger } from './utils/logger.js';
import { RuntimeRegistry } from './runtimes/registry.js';
import { NodeJSAdapter } from './runtimes/nodejs/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Register runtime adapters
RuntimeRegistry.register(new NodeJSAdapter());

const program = new Command();

program
  .name('hostfn')
  .description('Universal application deployment CLI')
  .version(packageJson.version);

// Init command
program
  .command('init')
  .description('Initialize hostfn configuration in current project')
  .action(async () => {
    try {
      const { initCommand } = await import('./commands/init.js');
      await initCommand();
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Server setup command
program
  .command('server')
  .description('Server management commands')
  .addCommand(
    new Command('setup')
      .description('Setup a new server for deployments')
      .argument('<host>', 'SSH connection string (user@host)')
      .option('--env <environment>', 'Environment name', 'production')
      .option('--node-version <version>', 'Node.js version', '20')
      .option('--port <port>', 'Service port', '3000')
      .option('--redis', 'Install Redis', false)
      .option('--password <password>', 'SSH password (if not using key auth)')
      .action(async (host, options) => {
        try {
          const { serverSetupCommand } = await import('./commands/server/setup.js');
          await serverSetupCommand(host, options);
        } catch (error) {
          Logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('info')
      .description('Show server information')
      .argument('<host>', 'SSH connection string (user@host)')
      .action(async (host) => {
        try {
          const { serverInfoCommand } = await import('./commands/server/info.js');
          await serverInfoCommand(host);
        } catch (error) {
          Logger.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

// Deploy command
program
  .command('deploy')
  .description('Deploy application to server')
  .argument('[environment]', 'Environment to deploy to', 'production')
  .option('--host <host>', 'Override server host')
  .option('--ci', 'CI/CD mode (non-interactive)', false)
  .option('--local', 'Local deployment mode (skip SSH, for self-hosted runners)', false)
  .option('--dry-run', 'Show what would be deployed without executing', false)
  .option('--service <name>', 'Deploy specific service in monorepo')
  .option('--all', 'Deploy all services in monorepo (default behavior)', false)
  .action(async (environment, options) => {
    try {
      const { deployCommand } = await import('./commands/deploy.js');
      await deployCommand(environment, options);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Logs command
program
  .command('logs')
  .description('View application logs')
  .argument('[environment]', 'Environment', 'production')
  .option('--lines <n>', 'Number of lines to show', '100')
  .option('--errors', 'Show only errors', false)
  .option('--output <file>', 'Save logs to file')
  .option('--service <name>', 'View logs for specific service in monorepo')
  .action(async (environment, options) => {
    try {
      const { logsCommand } = await import('./commands/logs.js');
      await logsCommand(environment, options);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show application status')
  .argument('[environment]', 'Environment', 'production')
  .option('--service <name>', 'Show status for specific service in monorepo')
  .action(async (environment, options) => {
    try {
      const { statusCommand } = await import('./commands/status.js');
      await statusCommand(environment, options);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Rollback command
program
  .command('rollback')
  .description('Rollback to previous deployment')
  .argument('[environment]', 'Environment', 'production')
  .option('--to <timestamp>', 'Rollback to specific backup')
  .action(async (environment, options) => {
    try {
      const { rollbackCommand } = await import('./commands/rollback.js');
      await rollbackCommand(environment, options);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Expose command
program
  .command('expose')
  .description('Configure Nginx and SSL for deployed services')
  .argument('[environment]', 'Environment', 'production')
  .option('--host <host>', 'Override server host')
  .option('--skip-ssl', 'Skip SSL certificate setup', false)
  .option('--force', 'Overwrite existing configuration', false)
  .action(async (environment, options) => {
    try {
      const { exposeCommand } = await import('./commands/expose.js');
      await exposeCommand(environment, options);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Environment variable commands
const envCommand = program
  .command('env')
  .description('Manage environment variables');

envCommand
  .command('list')
  .description('List environment variables on server (masked)')
  .argument('<environment>', 'Environment')
  .action(async (environment) => {
    try {
      const { envListCommand } = await import('./commands/env.js');
      await envListCommand(environment);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

envCommand
  .command('set')
  .description('Set an environment variable')
  .argument('<environment>', 'Environment')
  .argument('<key>', 'Variable name')
  .argument('<value>', 'Variable value')
  .action(async (environment, key, value) => {
    try {
      const { envSetCommand } = await import('./commands/env.js');
      await envSetCommand(environment, key, value);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

envCommand
  .command('push')
  .description('Upload .env file to server')
  .argument('<environment>', 'Environment')
  .argument('<file>', 'Local .env file path')
  .action(async (environment, file) => {
    try {
      const { envPushCommand } = await import('./commands/env.js');
      await envPushCommand(environment, file);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

envCommand
  .command('pull')
  .description('Download .env file from server')
  .argument('<environment>', 'Environment')
  .argument('<file>', 'Local file path to save to')
  .action(async (environment, file) => {
    try {
      const { envPullCommand } = await import('./commands/env.js');
      await envPullCommand(environment, file);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

envCommand
  .command('validate')
  .description('Validate required environment variables exist')
  .argument('<environment>', 'Environment')
  .action(async (environment) => {
    try {
      const { envValidateCommand } = await import('./commands/env.js');
      await envValidateCommand(environment);
    } catch (error) {
      Logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Parse CLI arguments
program.parse(process.argv);
