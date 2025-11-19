import ora from 'ora';
import chalk from 'chalk';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { createSSHConnection } from '../core/ssh.js';
import { RuntimeRegistry } from '../runtimes/registry.js';

interface StatusOptions {
  service?: string;
}

export async function statusCommand(
  environment: string,
  options: StatusOptions = {}
): Promise<void> {
  Logger.header(`Status - ${environment}`);

  // Load configuration
  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  // Handle multi-service status
  if (config.services && Object.keys(config.services).length > 0) {
    if (options.service) {
      // Show status for specific service
      if (!config.services[options.service]) {
        throw new Error(
          `Service '${options.service}' not found\n` +
          `Available: ${Object.keys(config.services).join(', ')}`
        );
      }
      const serviceConfig = config.services[options.service];
      const serviceServer = serviceConfig.server || envConfig.server;
      await showServiceStatus(
        `${config.name}-${options.service}-${environment}`,
        serviceServer,
        options.service
      );
    } else {
      // Show status for all services
      Logger.info(`Showing status for all ${Object.keys(config.services).length} services`);
      Logger.br();
      
      for (const serviceName of Object.keys(config.services)) {
        const serviceConfig = config.services[serviceName];
        const serviceServer = serviceConfig.server || envConfig.server;
        await showServiceStatus(
          `${config.name}-${serviceName}-${environment}`,
          serviceServer,
          serviceName
        );
        Logger.br();
      }
    }
    return;
  }

  const serviceName = `${config.name}-${environment}`;

  try {
    await showServiceStatus(serviceName, envConfig.server);
  } catch (error) {
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function showServiceStatus(
  serviceName: string,
  server: string,
  displayName?: string
): Promise<void> {
  const spinner = ora(`Fetching status for ${displayName || serviceName}...`).start();
  let ssh: { disconnect: () => void } | null = null;

  try {
    ssh = await createSSHConnection(server);
    spinner.succeed('Connected');

    Logger.br();

    // Get PM2 service details
    const result = await (ssh as any).exec(`pm2 jlist | jq '.[] | select(.name=="${serviceName}")'`);

    if (result.stdout.trim()) {
      const service = JSON.parse(result.stdout);
      
      const status = service.pm2_env?.status || 'unknown';
      const statusColor = status === 'online' ? chalk.green : chalk.red;

      if (displayName) {
        Logger.section(`Service: ${displayName}`);
      } else {
        Logger.section('Service Information');
      }
      Logger.kv('Name', service.name);
      Logger.kv('Status', statusColor(status));
      Logger.kv('PID', service.pid?.toString() || 'N/A');
      Logger.kv('Restarts', service.pm2_env?.restart_time?.toString() || '0');
      Logger.br();

      Logger.section('Resources');
      const memory = service.monit?.memory
        ? `${Math.round(service.monit.memory / 1024 / 1024)}MB`
        : 'N/A';
      const cpu = service.monit?.cpu !== undefined
        ? `${service.monit.cpu}%`
        : 'N/A';

      Logger.kv('Memory', memory);
      Logger.kv('CPU', cpu);
      Logger.br();

      Logger.section('Timing');
      if (service.pm2_env?.pm_uptime) {
        const uptime = Date.now() - service.pm2_env.pm_uptime;
        Logger.kv('Uptime', formatUptime(uptime));
      }
      if (service.pm2_env?.created_at) {
        Logger.kv('Created', new Date(service.pm2_env.created_at).toLocaleString());
      }
      Logger.br();

    } else {
      Logger.warn(`Service '${serviceName}' not found`);
      Logger.info('Has the service been deployed?');
    }

  } catch (error) {
    spinner.fail('Failed to get status');
    throw error;
  } finally {
    if (ssh) {
      ssh.disconnect();
    }
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
