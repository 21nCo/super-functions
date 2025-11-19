import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ora from 'ora';
import inquirer from 'inquirer';
import { Logger } from '../../utils/logger.js';
import { ConfigLoader } from '../../config/loader.js';
import { RuntimeRegistry } from '../../runtimes/registry.js';
import { createSSHConnection } from '../../core/ssh.js';
import { validateSSHConnection, validatePort, validateNodeVersion } from '../../utils/validation.js';

interface SetupOptions {
  env: string;
  nodeVersion: string;
  port: string;
  redis: boolean;
  password?: string;
  execute?: boolean;
}

export async function serverSetupCommand(
  host: string,
  options: SetupOptions
): Promise<void> {
  Logger.header('Server Setup');

  // Validate inputs
  if (!validateSSHConnection(host)) {
    process.exit(1);
  }

  if (!validatePort(parseInt(options.port))) {
    process.exit(1);
  }

  if (!validateNodeVersion(options.nodeVersion)) {
    process.exit(1);
  }

  Logger.kv('Host', host);
  Logger.kv('Environment', options.env);
  Logger.kv('Port', options.port);
  Logger.kv('Redis', options.redis ? 'Yes' : 'No');
  Logger.br();

  // Load config to detect runtime (or use default Node.js)
  let runtime = 'nodejs';
  try {
    if (ConfigLoader.exists()) {
      const config = ConfigLoader.load();
      runtime = config.runtime;
    }
  } catch {
    // If no config, assume Node.js
    Logger.warn('No config found, assuming Node.js runtime');
  }

  // Get runtime adapter
  const adapter = RuntimeRegistry.get(runtime as any);

  // Generate setup script
  const spinner = ora('Generating setup script...').start();
  
  const setupScript = adapter.generateSetupScript(options.nodeVersion, {
    port: parseInt(options.port),
    environment: options.env,
    installRedis: options.redis,
  });

  // Write script to temp file
  const scriptPath = join(tmpdir(), 'hostfn-setup.sh');
  writeFileSync(scriptPath, setupScript, { mode: 0o755 });
  
  spinner.succeed('Setup script generated');

  Logger.br();
  
  // Ask if user wants to execute now
  const { executeNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'executeNow',
      message: 'Execute setup on server now?',
      default: true,
    },
  ]);

  if (!executeNow) {
    Logger.br();
    Logger.info('Setup script saved at: ' + scriptPath);
    Logger.br();
    Logger.info('Run manually with:');
    Logger.command(`scp ${scriptPath} ${host}:~/hostfn-setup.sh`);
    Logger.command(`ssh ${host} 'bash ~/hostfn-setup.sh'`);
    return;
  }

  Logger.br();
  Logger.section('Executing Setup on Server');
  Logger.br();

  const connectSpinner = ora('Connecting to server...').start();

  try {
    // Connect to server
    const ssh = await createSSHConnection(host, {
      password: options.password,
    });

    connectSpinner.succeed('Connected to server');

    // Upload setup script
    const uploadSpinner = ora('Uploading setup script...').start();
    await ssh.uploadFile(scriptPath, '/tmp/hostfn-setup.sh');
    uploadSpinner.succeed('Setup script uploaded');

    // Make script executable
    await ssh.exec('chmod +x /tmp/hostfn-setup.sh');

    // Execute setup script with streaming output
    Logger.br();
    Logger.info('Executing setup (this may take several minutes)...');
    Logger.br();

    const result = await ssh.exec('bash /tmp/hostfn-setup.sh', {
      streaming: true,
      skipNvmSetup: true, // Setup script installs nvm, so skip the nvm check
    });

    Logger.br();

    if (result.exitCode === 0) {
      Logger.success('Server setup completed successfully!');
      Logger.br();
      Logger.info('Your server is ready for deployments.');
      Logger.br();
      Logger.info('Next steps:');
      Logger.br();
      Logger.info('1. Set environment variables (if needed):');
      Logger.command(`hostfn env push ${options.env} .env`);
      Logger.info('   Or set individual variables:');
      Logger.command(`hostfn env set ${options.env} KEY value`);
      Logger.br();
      Logger.info('2. Deploy your application:');
      Logger.command(`hostfn deploy ${options.env}`);
    } else {
      Logger.error('Setup failed with exit code: ' + result.exitCode);
      Logger.br();
      
      // Try to download the log file from the server
      try {
        const localLogPath = join(tmpdir(), `hostfn-setup-error-${Date.now()}.log`);
        await ssh.downloadFile('/tmp/hostfn-setup.log', localLogPath);
        Logger.info('Setup log downloaded to: ' + localLogPath);
        Logger.br();
        
        // Read and display the last 50 lines of the log
        const logContent = require('fs').readFileSync(localLogPath, 'utf-8');
        const lines = logContent.split('\n');
        const relevantLines = lines.slice(-50).join('\n');
        
        Logger.error('Last 50 lines of setup log:');
        Logger.log(relevantLines);
      } catch (logError) {
        Logger.warn('Could not download setup log from server');
        
        if (result.stderr) {
          Logger.br();
          Logger.error('Stderr output:');
          Logger.log(result.stderr);
        }
        if (result.stdout) {
          Logger.br();
          Logger.error('Stdout output (last 1000 chars):');
          Logger.log(result.stdout.slice(-1000));
        }
      }
      
      Logger.br();
      Logger.info('To inspect the full log on the server, run:');
      Logger.command(`ssh ${host} 'cat /tmp/hostfn-setup.log'`);
      
      process.exit(1);
    }

    // Cleanup
    await ssh.exec('rm /tmp/hostfn-setup.sh').catch(() => {});
    ssh.disconnect();

  } catch (error) {
    connectSpinner.fail('Setup failed');
    Logger.error(error instanceof Error ? error.message : String(error));
    Logger.br();
    Logger.info('Setup script saved at: ' + scriptPath);
    Logger.info('You can try running it manually:');
    Logger.command(`scp ${scriptPath} ${host}:~/hostfn-setup.sh`);
    Logger.command(`ssh ${host} 'bash ~/hostfn-setup.sh'`);
    process.exit(1);
  }
}
