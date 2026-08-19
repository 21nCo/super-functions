#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { generateTypesCommand } from './commands/generate-types.js';
import { addProviderCommand } from './commands/add-provider.js';
import { testCommand } from './commands/test.js';
import {
  connectionsListCommand,
  doctorCommand,
  providersInspectCommand,
  providersListCommand,
  syncBackfillCommand,
  webhooksReplayCommand,
} from './commands/runtime.js';

const program = new Command();

program
  .name('plugfn')
  .description('CLI tool for PlugFn SDK')
  .version('0.0.1');

// Init command
program
  .command('init')
  .description('Initialize a new PlugFn project')
  .option('-d, --directory <path>', 'Target directory', '.')
  .action(initCommand);

// Generate types command
program
  .command('generate-types')
  .description('Generate TypeScript types for providers')
  .option('-p, --provider <name>', 'Provider name')
  .option('-o, --output <path>', 'Output directory', './types')
  .option('-a, --all', 'Generate types for all providers')
  .action(generateTypesCommand);

// Add provider command
program
  .command('add-provider')
  .description('Create a new provider from template')
  .option('-n, --name <name>', 'Provider name (required)')
  .option('-a, --auth <type>', 'Auth type (oauth2, api-key, jwt, basic)', 'api-key')
  .option('-o, --output <path>', 'Output directory', './src/providers')
  .action(addProviderCommand);

// Test command
program
  .command('test')
  .description('Test connections and actions')
  .option('-p, --provider <name>', 'Provider to test')
  .option('-u, --user-id <id>', 'User ID to resolve connections for')
  .option('-a, --action <name>', 'Action to test')
  .option('-c, --connection-id <id>', 'Connection ID to use')
  .option('--params-file <path>', 'JSON file with action params')
  .option('--webhook-fixture <path>', 'JSON file with webhook diagnostic fixture')
  .option('--json', 'Emit machine-readable JSON output')
  .option('--live', 'Run optional provider live health check')
  .action(testCommand);

const providers = program.command('providers').description('Inspect registered providers');
providers
  .command('list')
  .description('List providers registered by the PlugFn runtime')
  .option('--json', 'Emit machine-readable JSON output')
  .action(providersListCommand);
providers
  .command('inspect')
  .description('Inspect a registered provider')
  .argument('<provider>', 'Provider id')
  .option('--json', 'Emit machine-readable JSON output')
  .action(providersInspectCommand);

const connections = program.command('connections').description('Inspect PlugFn connections');
connections
  .command('list')
  .description('List connections for a user')
  .option('-p, --provider <name>', 'Provider to filter by')
  .requiredOption('-u, --user-id <id>', 'User ID')
  .option('--json', 'Emit machine-readable JSON output')
  .action(connectionsListCommand);

const sync = program.command('sync').description('Run PlugFn sync jobs');
sync
  .command('backfill')
  .description('Start a full backfill sync job')
  .requiredOption('-p, --provider <name>', 'Provider id')
  .requiredOption('-c, --connection <id>', 'Connection id')
  .requiredOption('-r, --resource <name>', 'Resource name')
  .option('-u, --user-id <id>', 'Actor user ID')
  .option('--json', 'Emit machine-readable JSON output')
  .action(syncBackfillCommand);

const webhooks = program.command('webhooks').description('Inspect and replay PlugFn webhooks');
webhooks
  .command('replay')
  .description('Inspect a persisted webhook receipt and deliveries')
  .requiredOption('--receipt <id>', 'Webhook receipt id')
  .option('--json', 'Emit machine-readable JSON output')
  .action(webhooksReplayCommand);

program
  .command('doctor')
  .description('Validate PlugFn runtime wiring')
  .option('--json', 'Emit machine-readable JSON output')
  .action(doctorCommand);

program.parse(process.argv);
