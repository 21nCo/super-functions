import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { createSSHConnection } from '../core/ssh.js';
import { RuntimeRegistry } from '../runtimes/registry.js';
import { Runtime } from '../config/schema.js';

interface LogsOptions {
  lines: string;
  errors: boolean;
  follow?: boolean;
  output?: string;
  service?: string;
}

export async function logsCommand(
  environment: string,
  options: LogsOptions
): Promise<void> {
  Logger.header(`Logs - ${environment}`);

  // Load configuration
  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  // Handle multi-service logs
  if (config.services && Object.keys(config.services).length > 0) {
    if (!options.service) {
      throw new Error(
        'Multi-service deployment detected. Please specify --service <name>\n' +
        `Available services: ${Object.keys(config.services).join(', ')}`
      );
    }
    
    if (!config.services[options.service]) {
      throw new Error(
        `Service '${options.service}' not found\n` +
        `Available: ${Object.keys(config.services).join(', ')}`
      );
    }
    
    const serviceConfig = config.services[options.service];
    const serviceServer = serviceConfig.server || envConfig.server;
    const serviceName = `${config.name}-${options.service}-${environment}`;
    await fetchLogs(serviceName, serviceServer, config.runtime, options);
    return;
  }

  const serviceName = `${config.name}-${environment}`;
  await fetchLogs(serviceName, envConfig.server, config.runtime, options);
}

async function fetchLogs(
  serviceName: string,
  server: string,
  runtime: Runtime,
  options: LogsOptions
): Promise<void> {
  const adapter = RuntimeRegistry.get(runtime);
  const pm2 = adapter.getProcessManager();

  const spinner = ora('Connecting to server...').start();
  let ssh: { disconnect: () => void } | null = null;

  try {
    ssh = await createSSHConnection(server);
    spinner.succeed('Connected');

    Logger.br();

    // Generate logs command
    let logsCmd = pm2.generateLogsCommand(serviceName, parseInt(options.lines));
    
    // Add error filtering if requested
    if (options.errors) {
      logsCmd = `${logsCmd} 2>&1 | grep -E "(error|Error|ERROR|fail|Fail|FAIL|exception|Exception)"`;
    }
    
    // Execute logs command
    const result = await (ssh as any).exec(logsCmd, { streaming: !options.output });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to fetch logs');
    }

    // Save to file if requested
    if (options.output) {
      const outputPath = path.resolve(process.cwd(), options.output);
      fs.writeFileSync(outputPath, result.stdout);
      Logger.success(`Logs saved to: ${outputPath}`);
      Logger.kv('Lines', result.stdout.split('\n').length.toString());
      Logger.kv('Size', `${(result.stdout.length / 1024).toFixed(2)} KB`);
    }

  } catch (error) {
    spinner.fail('Failed to get logs');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    if (ssh) {
      ssh.disconnect();
    }
  }
}
