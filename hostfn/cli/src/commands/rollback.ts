import ora from 'ora';
import inquirer from 'inquirer';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { createSSHConnection } from '../core/ssh.js';
import { BackupManager } from '../core/backup.js';
import { RuntimeRegistry } from '../runtimes/registry.js';

interface RollbackOptions {
  to?: string;
}

export async function rollbackCommand(
  environment: string,
  options: RollbackOptions
): Promise<void> {
  Logger.header(`Rollback - ${environment}`);

  // Load configuration
  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(`Environment '${environment}' not found`);
  }

  const remoteDir = `/var/www/${config.name}-${environment}`;
  const serviceName = `${config.name}-${environment}`;

  const spinner = ora('Connecting to server...').start();
  let ssh: { disconnect: () => void } | null = null;

  try {
    ssh = await createSSHConnection(envConfig.server);
    spinner.succeed('Connected');

    Logger.br();

    const backupManager = new BackupManager(ssh as any, remoteDir);

    // List available backups
    const listSpinner = ora('Fetching available backups...').start();
    const backups = await backupManager.list();
    listSpinner.succeed(`Found ${backups.length} backup(s)`);

    if (backups.length === 0) {
      Logger.warn('No backups available');
      return;
    }

    Logger.br();

    let backupToRestore: string;

    if (options.to) {
      // Use specified backup
      if (!backups.includes(options.to)) {
        throw new Error(`Backup not found: ${options.to}`);
      }
      backupToRestore = options.to;
    } else {
      // Interactive selection
      Logger.section('Available Backups');
      backups.slice(0, 10).forEach((backup, idx) => {
        Logger.log(`  ${idx + 1}. ${backup}`);
      });
      Logger.br();

      const { selectedBackup } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedBackup',
          message: 'Select backup to restore:',
          choices: backups.slice(0, 10).map((b, idx) => ({
            name: `${idx + 1}. ${b}${idx === 0 ? ' (latest)' : ''}`,
            value: b,
          })),
        },
      ]);

      backupToRestore = selectedBackup;
    }

    // Confirm rollback
    Logger.br();
    Logger.warn(`This will rollback to: ${backupToRestore}`);
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to rollback?',
        default: false,
      },
    ]);

    if (!confirm) {
      Logger.info('Rollback cancelled');
      return;
    }

    Logger.br();

    // Perform rollback
    const rollbackSpinner = ora('Restoring backup...').start();
    await backupManager.restore(backupToRestore);
    rollbackSpinner.succeed('Backup restored');

    // Reload PM2
    const adapter = RuntimeRegistry.get(config.runtime);
    const pm2 = adapter.getProcessManager();
    
    const reloadSpinner = ora('Reloading service...').start();
    const reloadResult = await (ssh as any).exec(
      pm2.generateReloadCommand(serviceName),
      { cwd: remoteDir }
    );

    if (reloadResult.exitCode !== 0) {
      reloadSpinner.fail('Service reload failed');
      throw new Error(`PM2 reload failed: ${reloadResult.stderr}`);
    }
    reloadSpinner.succeed('Service reloaded');

    Logger.br();
    Logger.success('Rollback completed successfully!');
    Logger.br();
    Logger.kv('Restored backup', backupToRestore);
    Logger.kv('Service', serviceName);
    Logger.br();
    Logger.info('Check status:');
    Logger.command(`hostfn status ${environment}`);
    Logger.br();

  } catch (error) {
    spinner.fail('Rollback failed');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    if (ssh) {
      ssh.disconnect();
    }
  }
}
