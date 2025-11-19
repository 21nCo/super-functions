import ora from 'ora';
import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { createSSHConnection } from '../../core/ssh.js';

export async function serverInfoCommand(host: string): Promise<void> {
  Logger.header('Server Information');
  
  Logger.kv('Host', host);
  Logger.br();

  const spinner = ora('Connecting to server...').start();

  try {
    const ssh = await createSSHConnection(host);
    spinner.succeed('Connected');

    Logger.br();

    // Get system information
    const infoSpinner = ora('Gathering system information...').start();

    const [
      osInfo,
      nodeVersion,
      pm2Version,
      nginxStatus,
      diskSpace,
      memoryInfo,
      pm2List,
    ] = await Promise.all([
      ssh.exec('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\''),
      ssh.exec('source ~/.nvm/nvm.sh && node --version 2>/dev/null || echo "not installed"'),
      ssh.exec('pm2 --version 2>/dev/null || echo "not installed"'),
      ssh.exec('systemctl is-active nginx 2>/dev/null || echo "not running"'),
      ssh.exec('df -h / | tail -1'),
      ssh.exec('free -h'),
      ssh.exec('pm2 jlist 2>/dev/null || echo "[]"'),
    ]);

    infoSpinner.succeed('Information gathered');

    Logger.br();

    // Display OS information
    Logger.section('System');
    Logger.kv('OS', osInfo.stdout.trim() || 'Unknown');
    
    // Display disk space
    const diskParts = diskSpace.stdout.trim().split(/\s+/);
    if (diskParts.length >= 5) {
      Logger.kv('Disk', `${diskParts[2]} used / ${diskParts[1]} total (${diskParts[4]} used)`);
    }

    // Display memory
    const memLines = memoryInfo.stdout.trim().split('\n');
    if (memLines.length >= 2) {
      const memParts = memLines[1].split(/\s+/);
      if (memParts.length >= 3) {
        Logger.kv('Memory', `${memParts[2]} used / ${memParts[1]} total`);
      }
    }

    Logger.br();

    // Display runtime information
    Logger.section('Runtime');
    const node = nodeVersion.stdout.trim();
    Logger.kv('Node.js', node === 'not installed' ? chalk.red(node) : chalk.green(node));
    
    const pm2 = pm2Version.stdout.trim();
    Logger.kv('PM2', pm2 === 'not installed' ? chalk.red(pm2) : chalk.green(pm2));
    
    const nginx = nginxStatus.stdout.trim();
    Logger.kv('Nginx', nginx === 'active' ? chalk.green(nginx) : chalk.yellow(nginx));

    Logger.br();

    // Display running services
    Logger.section('Services');
    
    try {
      const services = JSON.parse(pm2List.stdout || '[]');
      
      if (services.length === 0) {
        Logger.info('No PM2 services running');
      } else {
        for (const service of services) {
          const status = service.pm2_env?.status || 'unknown';
          const memory = service.monit?.memory 
            ? `${Math.round(service.monit.memory / 1024 / 1024)}MB`
            : 'N/A';
          const cpu = service.monit?.cpu !== undefined
            ? `${service.monit.cpu}%`
            : 'N/A';
          const uptime = service.pm2_env?.pm_uptime
            ? formatUptime(Date.now() - service.pm2_env.pm_uptime)
            : 'N/A';

          const statusColor = status === 'online' ? chalk.green : chalk.red;
          
          Logger.log(`  ${chalk.bold(service.name)}`);
          Logger.log(`    Status: ${statusColor(status)}`);
          Logger.log(`    Memory: ${memory}  CPU: ${cpu}  Uptime: ${uptime}`);
          Logger.br();
        }
      }
    } catch {
      Logger.warn('Could not parse PM2 service list');
    }

    ssh.disconnect();

  } catch (error) {
    spinner.fail('Failed to get server information');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
