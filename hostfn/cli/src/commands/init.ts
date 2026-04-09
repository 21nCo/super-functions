import { writeFileSync } from 'fs';
import inquirer from 'inquirer';
import ora from 'ora';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { RuntimeRegistry } from '../runtimes/registry.js';
import { HostfnConfig, DEFAULT_CONFIG } from '../config/schema.js';

export async function initCommand(): Promise<void> {
  Logger.header('Initialize hostfn');

  // Check if config already exists
  if (ConfigLoader.exists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Configuration file already exists. Overwrite?',
        default: false,
      },
    ]);

    if (!overwrite) {
      Logger.info('Initialization cancelled');
      return;
    }
  }

  // Detect runtime
  const spinner = ora('Detecting project runtime...').start();
  const detection = await RuntimeRegistry.detect(process.cwd());

  if (!detection) {
    spinner.fail('Could not detect project runtime');
    Logger.error('No supported runtime detected in this directory');
    Logger.info('Supported runtimes: nodejs, python, go, ruby, rust');
    Logger.info('Make sure your project has the appropriate configuration files:');
    Logger.info('  - Node.js: package.json');
    Logger.info('  - Python: requirements.txt or pyproject.toml');
    Logger.info('  - Go: go.mod');
    return;
  }

  spinner.succeed(
    `Detected ${detection.runtime} (confidence: ${detection.confidence}%)`
  );

  if (detection.confidence < 80) {
    Logger.warn('Low confidence detection. Please verify the generated config.');
  }

  // Get default config from adapter
  const adapter = detection.adapter;
  const defaults = await adapter.getDefaultConfig(process.cwd());

  // Prompt for configuration
  Logger.br();
  Logger.section('Project Configuration');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Application name:',
      default: defaults.name,
      validate: (input: string) => input.length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'version',
      message: `${detection.runtime} version:`,
      default: defaults.version || '18',
    },
  ]);

  Logger.br();
  Logger.section('Environment Configuration');

  const envAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'server',
      message: 'Production server (user@host):',
      validate: (input: string) => {
        if (!input) return 'Server is required';
        if (!input.includes('@')) return 'Format: user@host';
        return true;
      },
    },
    {
      type: 'number',
      name: 'port',
      message: 'Production port:',
      default: 3000,
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Domain (optional):',
    },
  ]);

  Logger.br();
  Logger.section('Build & Start Configuration');

  const buildAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'buildCommand',
      message: 'Build command:',
      default: defaults.build?.command || 'npm run build',
    },
    {
      type: 'input',
      name: 'startCommand',
      message: 'Start command:',
      default: defaults.start?.command || 'npm start',
    },
  ]);

  // Generate configuration
  const config: HostfnConfig = {
    name: answers.name,
    runtime: detection.runtime,
    version: answers.version,
    environments: {
      production: {
        server: envAnswers.server,
        port: envAnswers.port,
        instances: 'max',
        ...(envAnswers.domain && { domain: envAnswers.domain }),
      },
    },
    build: {
      command: buildAnswers.buildCommand,
      directory: 'dist',
      nodeModules: 'all',
    },
    start: {
      command: buildAnswers.startCommand,
      entry: defaults.start?.entry,
    },
    env: {
      required: [],
      optional: [],
    },
    health: {
      path: '/health',
      timeout: 60,
      retries: 10,
      interval: 3,
    },
    sync: {
      exclude: [
        'node_modules',
        '.git',
        '.github',
        'dist',
        'build',
        '.env',
        '.env.*',
        '*.log',
      ],
    },
    backup: {
      keep: 5,
    },
  };

  // Write configuration file
  const configPath = ConfigLoader.getConfigPath();
  const spinner2 = ora('Writing configuration...').start();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    spinner2.succeed('Configuration created');

    Logger.br();
    Logger.success('hostfn initialized successfully!');
    Logger.br();
    Logger.kv('Config file', configPath);
    Logger.kv('Runtime', detection.runtime);
    Logger.kv('Environment', 'production');
    Logger.br();
    Logger.info('Next steps:');
    Logger.command('hostfn server setup ' + envAnswers.server);
    Logger.command('hostfn deploy production');
  } catch (error) {
    spinner2.fail('Failed to write configuration');
    throw error;
  }
}
