import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync } from 'fs';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { createSSHConnection } from '../core/ssh.js';

/**
 * List environment variables on server
 */
export async function envListCommand(environment: string): Promise<void> {
  Logger.header(`Environment Variables - ${environment}`);

  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  const spinner = ora('Connecting to server...').start();

  try {
    const ssh = await createSSHConnection(envConfig.server);
    spinner.succeed('Connected');

    const remoteDir = `/var/www/${config.name}-${environment}`;
    const envFile = `${remoteDir}/.env`;

    // Check if .env exists
    const exists = await ssh.exists(envFile);
    
    if (!exists) {
      spinner.warn('No .env file found on server');
      Logger.info(`File would be at: ${envFile}`);
      ssh.disconnect();
      return;
    }

    // Read .env file (masked)
    const result = await ssh.exec(`cat ${envFile}`);
    
    Logger.br();
    Logger.section('Environment Variables');
    
    const lines = result.stdout.trim().split('\n');
    const masked: string[] = [];
    
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        const [key] = line.split('=');
        masked.push(`${key}=***`);
      }
    }

    if (masked.length === 0) {
      Logger.info('No environment variables set');
    } else {
      masked.forEach(line => Logger.log(`  ${line}`));
    }

    Logger.br();
    Logger.info(`Total: ${masked.length} variable(s)`);
    Logger.br();

    ssh.disconnect();
  } catch (error) {
    spinner.fail('Failed to list environment variables');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Set environment variable on server
 */
export async function envSetCommand(
  environment: string,
  key: string,
  value: string
): Promise<void> {
  Logger.header(`Set Environment Variable - ${environment}`);

  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  Logger.kv('Key', key);
  Logger.kv('Value', '***');
  Logger.br();

  const spinner = ora('Connecting to server...').start();

  try {
    const ssh = await createSSHConnection(envConfig.server);
    spinner.succeed('Connected');

    const remoteDir = `/var/www/${config.name}-${environment}`;
    const envFile = `${remoteDir}/.env`;

    // Ensure directory exists
    await ssh.mkdir(remoteDir, true);

    // Check if .env file exists
    const fileExists = await ssh.exists(envFile);
    
    if (!fileExists) {
      spinner.fail('.env file not found on server');
      Logger.error('No .env file exists on the server');
      Logger.info('Push environment file first:');
      Logger.command(`hostfn env push ${environment} .env`);
      ssh.disconnect();
      process.exit(1);
    }

    // Validate key format
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw new Error('Invalid key format. Must be uppercase, alphanumeric, and underscores only.');
    }

    // Check if key already exists
    const checkResult = await ssh.exec(
      `grep -q "^${key}=" ${envFile} 2>/dev/null && echo "exists" || echo "new"`
    );

    const isNew = checkResult.stdout.trim() === 'new';

    const updateSpinner = ora(
      isNew ? 'Adding variable...' : 'Updating variable...'
    ).start();

    // Use a temporary file strategy to avoid shell injection issues with value
    const tempFile = `/tmp/env_var_${Date.now()}`;
    await ssh.exec(`echo "${value.replace(/"/g, '\\"')}" > ${tempFile}`);

    if (isNew) {
      // Append new variable safely
      await ssh.exec(`echo "${key}=\\"$(cat ${tempFile})\\"" >> ${envFile}`);
    } else {
      // Update existing variable safely using temp file content
      // We use a more complex sed or awk command, or just overwrite the line
      // Constructing safe sed is hard, so let's use grep -v to remove old and append new
      await ssh.exec(`grep -v "^${key}=" ${envFile} > ${envFile}.tmp && mv ${envFile}.tmp ${envFile}`);
      await ssh.exec(`echo "${key}=\\"$(cat ${tempFile})\\"" >> ${envFile}`);
    }
    
    // Cleanup temp file
    await ssh.exec(`rm ${tempFile}`);

    updateSpinner.succeed(isNew ? 'Variable added' : 'Variable updated');

    Logger.br();
    Logger.success('Environment variable set successfully!');
    Logger.br();
    Logger.warn('Restart service for changes to take effect:');
    Logger.command(`hostfn deploy ${environment}`);
    Logger.br();

    ssh.disconnect();
  } catch (error) {
    spinner.fail('Failed to set environment variable');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Push .env file to server
 */
export async function envPushCommand(
  environment: string,
  localFile: string
): Promise<void> {
  Logger.header(`Push Environment File - ${environment}`);

  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  // Read local file
  try {
    const content = readFileSync(localFile, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    
    Logger.kv('Local file', localFile);
    Logger.kv('Variables', lines.length.toString());
    Logger.br();

    // Confirm
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Push ${lines.length} variables to ${environment}?`,
        default: false,
      },
    ]);

    if (!confirm) {
      Logger.info('Push cancelled');
      return;
    }

    const spinner = ora('Connecting to server...').start();

    const ssh = await createSSHConnection(envConfig.server);
    spinner.succeed('Connected');

    const remoteDir = `/var/www/${config.name}-${environment}`;
    const envFile = `${remoteDir}/.env`;

    // Ensure directory exists
    const dirSpinner = ora('Ensuring remote directory exists...').start();
    await ssh.mkdir(remoteDir, true);
    dirSpinner.succeed('Remote directory ready');

    // Create backup
    const backupSpinner = ora('Creating backup...').start();
    await ssh.exec(`cp ${envFile} ${envFile}.backup 2>/dev/null || true`);
    backupSpinner.succeed('Backup created');

    // Upload file
    const uploadSpinner = ora('Uploading .env file...').start();
    
    // Write content via SSH (safer than SFTP for small files)
    await ssh.exec(`cat > ${envFile} << 'ENVEOF'
${content}
ENVEOF`);

    uploadSpinner.succeed('.env file uploaded');

    Logger.br();
    Logger.success('Environment file pushed successfully!');
    Logger.br();
    Logger.info('Backup saved at: ' + envFile + '.backup');
    Logger.br();
    Logger.warn('Restart service for changes to take effect:');
    Logger.command(`hostfn deploy ${environment}`);
    Logger.br();

    ssh.disconnect();
  } catch (error) {
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Pull .env file from server
 */
export async function envPullCommand(
  environment: string,
  localFile: string
): Promise<void> {
  Logger.header(`Pull Environment File - ${environment}`);

  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  const spinner = ora('Connecting to server...').start();

  try {
    const ssh = await createSSHConnection(envConfig.server);
    spinner.succeed('Connected');

    const remoteDir = `/var/www/${config.name}-${environment}`;
    const envFile = `${remoteDir}/.env`;

    // Check if exists
    const exists = await ssh.exists(envFile);
    
    if (!exists) {
      spinner.warn('No .env file found on server');
      ssh.disconnect();
      return;
    }

    // Download file
    const downloadSpinner = ora('Downloading .env file...').start();
    const result = await ssh.exec(`cat ${envFile}`);
    
    writeFileSync(localFile, result.stdout);
    downloadSpinner.succeed('.env file downloaded');

    Logger.br();
    Logger.success('Environment file pulled successfully!');
    Logger.br();
    Logger.kv('Saved to', localFile);
    Logger.br();
    Logger.warn('⚠️  This file contains sensitive data - do not commit to git!');
    Logger.br();

    ssh.disconnect();
  } catch (error) {
    spinner.fail('Failed to pull environment file');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Validate required environment variables
 */
export async function envValidateCommand(environment: string): Promise<void> {
  Logger.header(`Validate Environment Variables - ${environment}`);

  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  const required = config.env.required || [];
  
  if (required.length === 0) {
    Logger.warn('No required environment variables defined in config');
    Logger.info('Add them to hostfn.config.json under env.required');
    return;
  }

  Logger.info(`Checking ${required.length} required variable(s)...`);
  Logger.br();

  const spinner = ora('Connecting to server...').start();

  try {
    const ssh = await createSSHConnection(envConfig.server);
    spinner.succeed('Connected');

    const remoteDir = `/var/www/${config.name}-${environment}`;
    const envFile = `${remoteDir}/.env`;

    // Check if exists
    const exists = await ssh.exists(envFile);
    
    if (!exists) {
      Logger.error('No .env file found on server');
      Logger.info('Push environment variables first:');
      Logger.command(`hostfn env push ${environment} .env`);
      ssh.disconnect();
      process.exit(1);
    }

    // Read env file
    const result = await ssh.exec(`cat ${envFile}`);
    const content = result.stdout;

    // Parse variables
    const envVars = new Set<string>();
    content.split('\n').forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key] = line.split('=');
        if (key) envVars.add(key.trim());
      }
    });

    // Check each required variable
    const missing: string[] = [];
    
    Logger.section('Validation Results');
    
    for (const varName of required) {
      if (envVars.has(varName)) {
        Logger.log(`  ✓ ${varName}`);
      } else {
        Logger.log(`  ✗ ${varName} (missing)`);
        missing.push(varName);
      }
    }

    Logger.br();

    if (missing.length === 0) {
      Logger.success('All required environment variables are set!');
    } else {
      Logger.error(`Missing ${missing.length} required variable(s)`);
      Logger.br();
      Logger.info('Set missing variables:');
      missing.forEach(v => {
        Logger.command(`hostfn env set ${environment} ${v} "value"`);
      });
      process.exit(1);
    }

    Logger.br();

    ssh.disconnect();
  } catch (error) {
    spinner.fail('Failed to validate environment variables');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
