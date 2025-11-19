import ora from 'ora';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync, cpSync } from 'fs';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { createSSHConnection, SSHConnection } from '../core/ssh.js';
import { LocalExecutor } from '../core/local.js';
import { FileSync } from '../core/sync.js';
import { HealthCheck } from '../core/health.js';
import { BackupManager } from '../core/backup.js';
import { LockManager } from '../core/lock.js';
import { RuntimeRegistry } from '../runtimes/registry.js';
import { validateEnvironmentName, validateHttpUrl, validateRemotePath } from '../utils/validation.js';
import { HostfnConfig, EnvironmentConfig } from '../config/schema.js';
import { PM2Manager } from '../runtimes/nodejs/pm2.js';
import { WorkspaceManager } from '../core/workspace.js';

interface DeployOptions {
  host?: string;
  ci: boolean;
  local: boolean;
  dryRun: boolean;
  service?: string;
  all?: boolean;
}

export async function deployCommand(
  environment: string,
  options: DeployOptions
): Promise<void> {
  const startTime = Date.now();
  
  Logger.header('Deploy Application');

  // Validate environment name
  if (!validateEnvironmentName(environment)) {
    process.exit(1);
  }

  // Load configuration
  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];

  if (!envConfig) {
    throw new Error(
      `Environment '${environment}' not found in configuration\n` +
      `Available: ${Object.keys(config.environments).join(', ')}`
    );
  }

  // Handle multi-service deployment
  if (config.services && Object.keys(config.services).length > 0) {
    await deployMultiService(config, environment, envConfig, options, startTime);
    return;
  }

  // Single service deployment
  const host = process.env.HOSTFN_HOST || options.host || envConfig.server;
  const remoteDir = `/var/www/${config.name}-${environment}`;

  Logger.kv('Application', config.name);
  Logger.kv('Runtime', config.runtime);
  Logger.kv('Environment', environment);
  Logger.kv('Server', host);
  Logger.kv('Port', envConfig.port.toString());
  Logger.kv('Remote Directory', remoteDir);
  Logger.br();

  try {
    await deploySingleService(config, envConfig, environment, options);

    // Success!
    const duration = Math.round((Date.now() - startTime) / 1000);
    const serviceName = `${config.name}-${environment}`;
    const hostname = host.includes('@') ? host.split('@')[1] : host;
    const healthUrl = `http://${hostname}:${envConfig.port}${config.health?.path || '/health'}`;
    
    Logger.br();
    Logger.success('Deployment completed successfully!');
    Logger.br();
    Logger.kv('Environment', environment);
    Logger.kv('Service', serviceName);
    Logger.kv('Duration', `${duration}s`);
    Logger.kv('Health URL', healthUrl);
    Logger.br();
    Logger.info('Next steps:');
    Logger.br();
    Logger.info('1. Configure domain and SSL (if needed):');
    Logger.command(`hostfn expose ${environment}`);
    Logger.br();
    Logger.info('2. View logs:');
    Logger.command(`hostfn logs ${environment}`);
    Logger.br();
  } catch (error) {
    process.exit(1);
  }
}

/**
 * Deploy multiple services in a monorepo
 */
async function deployMultiService(
  config: HostfnConfig,
  environment: string,
  envConfig: EnvironmentConfig,
  options: DeployOptions,
  startTime: number
): Promise<void> {
  const services = config.services!;
  const serviceNames = Object.keys(services);

  // Determine which services to deploy
  let servicesToDeploy: string[] = [];

  if (options.service) {
    // Deploy specific service
    if (!services[options.service]) {
      throw new Error(
        `Service '${options.service}' not found in configuration\n` +
        `Available services: ${serviceNames.join(', ')}`
      );
    }
    servicesToDeploy = [options.service];
  } else if (options.all) {
    // Deploy all services
    servicesToDeploy = serviceNames;
  } else {
    // No flag specified - default to all services
    servicesToDeploy = serviceNames;
    Logger.info(`Deploying all ${serviceNames.length} services (use --service <name> to deploy specific service)`);
    Logger.br();
  }

  Logger.kv('Application', config.name);
  Logger.kv('Environment', environment);
  Logger.kv('Services to deploy', servicesToDeploy.join(', '));
  Logger.br();

  const results: { service: string; success: boolean; error?: string }[] = [];

  // Deploy each service
  for (const serviceName of servicesToDeploy) {
    const serviceConfig = services[serviceName];
    
    // Determine which server to use: service-specific or environment default
    const serviceServer = serviceConfig.server || envConfig.server;
    
    Logger.section(`Deploying Service: ${serviceName}`);
    Logger.kv('Path', serviceConfig.path);
    Logger.kv('Port', serviceConfig.port.toString());
    Logger.kv('Server', serviceServer);
    if (serviceConfig.domain) {
      const domainDisplay = Array.isArray(serviceConfig.domain) 
        ? serviceConfig.domain.join(', ') 
        : serviceConfig.domain;
      Logger.kv('Domain', domainDisplay);
    }
    if (serviceConfig.instances) {
      Logger.kv('Instances', serviceConfig.instances.toString());
    }
    Logger.br();

    try {
      // Create a modified config for this specific service
      const serviceSpecificConfig: HostfnConfig = {
        ...config,
        name: `${config.name}-${serviceName}`,
        services: undefined, // Remove services to avoid recursion
      };

      const serviceEnvConfig: EnvironmentConfig = {
        ...envConfig,
        server: serviceServer, // Use service-specific server or default
        port: serviceConfig.port,
        ...(serviceConfig.instances && { instances: serviceConfig.instances }),
        ...(serviceConfig.domain && { domain: serviceConfig.domain }),
      };

      // Get the service path
      const servicePath = serviceConfig.path;
      const originalCwd = process.cwd();
      
      try {
        // Change to service directory
        process.chdir(servicePath);

        // Deploy single service
        await deploySingleService(
          serviceSpecificConfig,
          serviceEnvConfig,
          environment,
          options,
          servicePath
        );

        results.push({ service: serviceName, success: true });
        Logger.success(`Service '${serviceName}' deployed successfully`);
        Logger.br();
      } catch (error) {
        // Restore original directory in case of error
        process.chdir(originalCwd);
        throw error;
      } finally {
        // Restore original directory
        if (process.cwd() !== originalCwd) {
          process.chdir(originalCwd);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ service: serviceName, success: false, error: errorMsg });
      Logger.error(`Service '${serviceName}' deployment failed: ${errorMsg}`);
      Logger.br();

      // Continue to next service instead of failing entirely
      if (servicesToDeploy.length > 1) {
        Logger.info('Continuing with remaining services...');
        Logger.br();
      }
    }
  }

  // Summary
  const duration = Math.round((Date.now() - startTime) / 1000);
  Logger.section('Deployment Summary');
  Logger.br();

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  Logger.kv('Total services', results.length.toString());
  Logger.kv('Successful', successful.length.toString());
  Logger.kv('Failed', failed.length.toString());
  Logger.kv('Duration', `${duration}s`);
  Logger.br();

  if (successful.length > 0) {
    Logger.info('Successful deployments:');
    successful.forEach(r => Logger.log(`  ✓ ${r.service}`));
    Logger.br();
  }

  if (failed.length > 0) {
    Logger.error('Failed deployments:');
    failed.forEach(r => Logger.log(`  ✗ ${r.service}: ${r.error}`));
    Logger.br();
    process.exit(1);
  }

  Logger.success('All services deployed successfully!');
  Logger.br();
  Logger.info('Next steps:');
  Logger.br();
  Logger.info('Configure domain and SSL (if needed):');
  Logger.command(`hostfn expose ${environment}`);
  Logger.br();
}

/**
 * Deploy a single service (extracted from original deployCommand)
 */
async function deploySingleService(
  config: HostfnConfig,
  envConfig: EnvironmentConfig,
  environment: string,
  options: DeployOptions,
  servicePath?: string
): Promise<void> {
  // Support HOSTFN_HOST override for CI/CD
  const host = process.env.HOSTFN_HOST || options.host || envConfig.server;
  const remoteDir = `/var/www/${config.name}-${environment}`;

  // Validate remote directory
  if (!validateRemotePath(remoteDir)) {
    process.exit(1);
  }

  const sourceDir = servicePath || process.cwd();

  if (options.dryRun) {
    Logger.warn('DRY RUN MODE - No changes will be made');
    Logger.br();
    await dryRunDeploy(config, envConfig, environment, remoteDir, host);
    return;
  }

  if (options.ci) {
    Logger.info('Running in CI/CD mode');
    Logger.br();
  }
  
  if (options.local) {
    Logger.info('Running in LOCAL mode (self-hosted)');
    Logger.br();
  }

  // Get runtime adapter
  const adapter = RuntimeRegistry.get(config.runtime);
  const pm2 = adapter.getProcessManager();
  const serviceName = `${config.name}-${environment}`;

  let ssh: SSHConnection | LocalExecutor | null = null;
  let backupPath: string | null = null;
  let lockManager: LockManager | null = null;
  let bundleDir: string | null = null;

  try {
    // ===== Phase 1: Pre-flight Checks =====
    Logger.section('Pre-flight Checks');
    Logger.br();

    // For local mode, skip rsync and SSH connection
    if (options.local) {
      const localSpinner = ora('Initializing local deployment...').start();
      ssh = new LocalExecutor();
      localSpinner.succeed('Local mode ready');
    } else {
      // Check rsync availability
      const rsyncSpinner = ora('Checking rsync availability...').start();
      const hasRsync = await FileSync.isRsyncAvailable();
      if (!hasRsync) {
        rsyncSpinner.fail('rsync not installed');
        throw new Error('rsync is required for deployment. Please install it first.');
      }
      rsyncSpinner.succeed('rsync available');

      // Connect to server
      const connectSpinner = ora('Connecting to server...').start();
      ssh = await createSSHConnection(host);
      connectSpinner.succeed('Connected to server');
    }

    // Verify Node version and PM2 installation
    const versionCheckSpinner = ora('Checking Node.js version...').start();
    const nodeVersionCheck = await ssh.exec('node --version');
    const currentVersion = nodeVersionCheck.stdout.trim().replace('v', '');
    const requiredVersion = config.version;
    
    if (!currentVersion.startsWith(requiredVersion)) {
      versionCheckSpinner.text = `Switching to Node.js v${requiredVersion}...`;
      await ssh.exec(`nvm install ${requiredVersion} && nvm alias default ${requiredVersion}`);
      versionCheckSpinner.succeed(`Node.js v${requiredVersion} activated`);
    } else {
      versionCheckSpinner.succeed(`Node.js v${currentVersion} ready`);
    }
    
    // Ensure PM2 is installed
    const pm2Check = await ssh.exec('command -v pm2 || echo "missing"');
    if (pm2Check.stdout.includes('missing')) {
      const pm2Spinner = ora('Installing PM2...').start();
      await ssh.exec('npm install -g pm2');
      pm2Spinner.succeed('PM2 installed');
    }

    // Check if remote directory exists, create if not
    const remoteDirExists = await ssh.exists(remoteDir);
    if (!remoteDirExists) {
      const mkdirSpinner = ora('Creating remote directory...').start();
      await ssh.mkdir(remoteDir, true);
      mkdirSpinner.succeed('Remote directory created');
    }

    // Acquire deployment lock
    const lockSpinner = ora('Acquiring deployment lock...').start();
    lockManager = new LockManager(ssh as any, remoteDir);
    const lockAcquired = await lockManager.acquire();
    
    if (!lockAcquired) {
      lockSpinner.fail('Could not acquire deployment lock');
      ssh.disconnect();
      process.exit(1);
    }
    
    lockSpinner.succeed('Deployment lock acquired');

    Logger.br();

    // ===== Phase 1.5: Workspace Bundling =====
    const workspaceManager = new WorkspaceManager();
    const isWorkspace = await workspaceManager.detectWorkspace(sourceDir);
    let actualSourceDir = sourceDir;

    if (isWorkspace) {
      const workspaceDeps = workspaceManager.getWorkspaceDependencies(sourceDir);
      
      if (workspaceDeps.length > 0) {
        Logger.section('Workspace Bundling');
        Logger.br();
        Logger.info(`Detected ${workspaceDeps.length} workspace dependencies: ${workspaceDeps.join(', ')}`);
        Logger.br();

        const bundleSpinner = ora('Creating deployment bundle...').start();
        
        bundleDir = mkdtempSync(join(tmpdir(), 'hostfn-bundle-'));
        
        cpSync(sourceDir, bundleDir, {
          recursive: true,
          filter: (src) => {
            return !src.includes('node_modules') && !src.includes('.git');
          },
        });
        
        bundleSpinner.text = 'Bundling workspace dependencies...';
        await workspaceManager.bundleWorkspaceDependencies(sourceDir, bundleDir);
        
        bundleSpinner.succeed('Workspace dependencies bundled');
        Logger.br();
        
        actualSourceDir = bundleDir;
      }
    }

    // ===== Phase 2: File Sync =====
    Logger.section('Syncing Files');
    Logger.br();

    if (options.local) {
      // Local mode: copy files directly
      const syncSpinner = ora('Copying files locally...').start();
      
      cpSync(actualSourceDir, remoteDir, {
        recursive: true,
        filter: (src) => {
          const relativePath = src.replace(actualSourceDir, '');
          const excludePatterns = config.sync?.exclude || [
            'node_modules',
            '.git',
            'dist',
            '.env',
            '*.log',
          ];
          return !excludePatterns.some(pattern => relativePath.includes(pattern));
        },
      });
      
      syncSpinner.succeed('Files copied successfully');
      
      // Copy workspace dependencies if they exist
      if (bundleDir) {
        const bundledNodeModules = join(bundleDir, 'node_modules');
        const { existsSync } = await import('fs');
        
        if (existsSync(bundledNodeModules)) {
          const uploadSpinner = ora('Copying workspace dependencies...').start();
          cpSync(bundledNodeModules, join(remoteDir, 'node_modules'), { recursive: true });
          uploadSpinner.succeed('Workspace dependencies copied');
        }
      }
    } else {
      // Remote mode: use rsync
      const syncSpinner = ora('Syncing files to server...').start();
      
      await FileSync.sync(
        actualSourceDir,
        remoteDir,
        host,
        {
          exclude: config.sync?.exclude || [
            'node_modules',
            '.git',
            'dist',
            '.env',
            '*.log',
          ],
          verbose: false,
        }
      );

      syncSpinner.succeed('Files synced successfully');
      
      // Upload bundled workspace dependencies if they exist (before npm install)
      if (bundleDir) {
        const bundledNodeModules = join(bundleDir, 'node_modules');
        const { existsSync } = await import('fs');
        
        if (existsSync(bundledNodeModules)) {
          Logger.section('Uploading Workspace Dependencies');
          Logger.br();
          
          const uploadSpinner = ora('Uploading bundled workspace dependencies...').start();
          
          await FileSync.sync(
            bundledNodeModules,
            join(remoteDir, 'node_modules'),
            host,
            {
              exclude: [],
              verbose: false,
            }
          );
          
          uploadSpinner.succeed('Workspace dependencies uploaded');
          Logger.br();
        }
      }
    }
    
    Logger.br();

    // ===== Phase 3: Remote Build =====
    Logger.section('Building Application');
    Logger.br();

    // Install dependencies
    const installSpinner = ora('Installing dependencies...').start();
    
    // Check if package-lock.json exists, use npm ci if available, otherwise npm install
    const lockFileCheck = await ssh.exec(
      'test -f package-lock.json && echo "exists"',
      { cwd: remoteDir, streaming: false }
    );
    const hasLockFile = lockFileCheck.stdout.trim() === 'exists';
    
    // If build command exists, install all dependencies (including dev); otherwise production only
    const needsDevDeps = !!config.build?.command;
    const installCmd = hasLockFile 
      ? (needsDevDeps ? 'npm ci --install-links' : 'npm ci --production --install-links')
      : (needsDevDeps ? 'npm install --install-links' : 'npm install --production --install-links');
    
    const installResult = await ssh.exec(
      installCmd,
      { cwd: remoteDir, streaming: false }
    );
    
    if (installResult.exitCode !== 0) {
      installSpinner.fail('Dependency installation failed');
      throw new Error(`${installCmd} failed: ${installResult.stderr}`);
    }
    installSpinner.succeed('Dependencies installed');

    // Build application
    if (config.build?.command) {
      const buildSpinner = ora('Building application...').start();
      const buildResult = await ssh.exec(
        config.build.command.replace('npm run ', 'npm run '),
        { cwd: remoteDir, streaming: false }
      );
      
      if (buildResult.exitCode !== 0) {
        buildSpinner.fail('Build failed');
        const errorOutput = buildResult.stderr || buildResult.stdout;
        throw new Error(`Build failed: ${errorOutput}`);
      }
      buildSpinner.succeed('Build completed');
    }

    Logger.br();

    // ===== Phase 4: Backup =====
    Logger.section('Creating Backup');
    Logger.br();

    const backupManager = new BackupManager(ssh as any, remoteDir);
    const backupSpinner = ora('Creating backup of current deployment...').start();
    
    // Check if there's anything to backup
    const hasExistingDeployment = await ssh.exists(`${remoteDir}/dist`);

    if (!hasExistingDeployment) {
      backupSpinner.info('No existing deployment to backup');
    } else {
      try {
        backupPath = await backupManager.create();
        backupSpinner.succeed(`Backup created: ${backupPath.split('/').pop()}`);
      } catch (error) {
        backupSpinner.fail('Failed to create backup');
        throw error;
      }
    }

    Logger.br();

    // ===== Phase 5: PM2 Deployment =====
    Logger.section('Deploying Service');
    Logger.br();

    // Read .env file from remote server
    const envFileResult = await ssh.exec(`cat ${remoteDir}/.env 2>/dev/null || echo ""`, { cwd: remoteDir, streaming: false });
    const envVars: Record<string, string> = {};
    
    if (envFileResult.stdout) {
      // Parse .env file
      envFileResult.stdout.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const equalIndex = line.indexOf('=');
          if (equalIndex > 0) {
            const key = line.substring(0, equalIndex).trim();
            let value = line.substring(equalIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            envVars[key] = value;
          }
        }
      });
    }

    // Check if service already exists
    const checkPm2 = await ssh.exec('pm2 list | grep "' + serviceName + '" || true');
    const serviceExists = checkPm2.stdout.includes(serviceName);

    if (serviceExists) {
      const reloadSpinner = ora('Reloading PM2 process (zero-downtime)...').start();
      
      // Regenerate PM2 ecosystem file with env vars
      const pm2Manager = pm2 as PM2Manager;
      const ecosystemConfig = pm2Manager.generateEcosystemConfig(
        {
          name: config.name,
          runtime: config.runtime,
          version: config.version,
          start: config.start,
          port: envConfig.port,
        },
        environment,
        envVars
      );
      
      await ssh.exec(`cat > ${remoteDir}/ecosystem.config.cjs << 'EOF'
${ecosystemConfig}
EOF`);
      
      // Delete and restart the service with the updated ecosystem config
      await ssh.exec(`pm2 delete ${serviceName} || true`, { cwd: remoteDir });
      const startResult = await ssh.exec(
        `pm2 start ${remoteDir}/ecosystem.config.cjs`,
        { cwd: remoteDir }
      );
      
      if (startResult.exitCode !== 0) {
        reloadSpinner.fail('PM2 reload failed');
        throw new Error(`PM2 reload failed: ${startResult.stderr}`);
      }
      
      // Save PM2 configuration
      await ssh.exec('pm2 save');
      
      reloadSpinner.succeed('Service reloaded');
    } else {
      const startSpinner = ora('Starting PM2 process...').start();
      
      // Create PM2 ecosystem file
      const pm2Manager = pm2 as PM2Manager;
      const ecosystemConfig = pm2Manager.generateEcosystemConfig(
        {
          name: config.name,
          runtime: config.runtime,
          version: config.version,
          start: config.start,
          port: envConfig.port,
        },
        environment,
        envVars
      );
      
      await ssh.exec(`cat > ${remoteDir}/ecosystem.config.cjs << 'EOF'
${ecosystemConfig}
EOF`);
      
      const startResult = await ssh.exec(
        `pm2 start ${remoteDir}/ecosystem.config.cjs`,
        { cwd: remoteDir }
      );
      
      if (startResult.exitCode !== 0) {
        startSpinner.fail('PM2 start failed');
        throw new Error(`PM2 start failed: ${startResult.stderr}`);
      }
      
      // Save PM2 configuration
      await ssh.exec('pm2 save');
      
      startSpinner.succeed('Service started');
    }

    Logger.br();

    // ===== Phase 6: Health Check =====
    Logger.section('Health Check');
    Logger.br();

    const healthSpinner = ora('Waiting for service to be ready...').start();
    const healthPath = config.health?.path || '/health';
    const retries = config.health?.retries || 10;
    const interval = config.health?.interval || 3000;
    
    let healthy = false;
    for (let i = 0; i < retries; i++) {
      healthSpinner.text = `Health check attempt ${i + 1}/${retries}...`;
      
      // Check health via SSH using curl on localhost
      const healthCheckResult = await ssh.exec(
        `curl -sf http://localhost:${envConfig.port}${healthPath}`,
        { cwd: remoteDir, streaming: false }
      );
      
      if (healthCheckResult.exitCode === 0) {
        healthy = true;
        healthSpinner.succeed('Health check passed');
        break;
      }
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    if (!healthy) {
      healthSpinner.fail('Health check failed');
      throw new Error('Service is not responding to health checks');
    }

    Logger.br();

    // ===== Phase 7: Cleanup =====
    // Cleanup old backups
    await backupManager.cleanup(config.backup?.keep || 5);

    // Release lock before success message
    if (lockManager) {
      await lockManager.release();
      lockManager = null;
    }

  } catch (error) {
    Logger.br();
    Logger.error('Deployment failed!');
    Logger.error(error instanceof Error ? error.message : String(error));
    Logger.br();

    // ===== Auto-Rollback =====
    if (backupPath && ssh) {
      Logger.section('Rolling Back');
      Logger.br();
      
      const rollbackSpinner = ora('Restoring previous deployment...').start();
      
      try {
        const backupManager = new BackupManager(ssh as any, remoteDir);
        await backupManager.restore(backupPath.split('/').pop()!);
        
        // Reload PM2 with old version
        const adapter = RuntimeRegistry.get(config.runtime);
        const pm2 = adapter.getProcessManager();
        await ssh.exec(pm2.generateReloadCommand(serviceName), { cwd: remoteDir });
        
        rollbackSpinner.succeed('Rolled back to previous deployment');
        Logger.info('Previous deployment restored successfully');
      } catch (rollbackError) {
        rollbackSpinner.fail('Rollback failed');
        Logger.error('Manual intervention required');
        Logger.error(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
      
      Logger.br();
    }

    throw error; // Re-throw for multi-service handler
  } finally {
    // Always release lock
    if (lockManager) {
      await lockManager.release();
    }
    
    if (ssh) {
      ssh.disconnect();
    }
    
    // Cleanup bundle directory
    if (bundleDir) {
      try {
        rmSync(bundleDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Dry run - show what would be deployed
 */
async function dryRunDeploy(
  config: HostfnConfig,
  envConfig: EnvironmentConfig,
  environment: string,
  remoteDir: string,
  host: string
): Promise<void> {
  Logger.info('Deployment Plan:');
  Logger.br();
  
  Logger.log('1. Pre-flight Checks');
  Logger.log('   ✓ Check rsync availability');
  Logger.log('   ✓ Connect to server');
  Logger.log('   ✓ Verify remote directory');
  Logger.br();
  
  Logger.log('2. File Sync');
  Logger.log(`   → Sync ${process.cwd()} to ${remoteDir}`);
  Logger.log(`   → Exclude: ${config.sync?.exclude?.join(', ')}`);
  Logger.br();
  
  Logger.log('3. Remote Build');
  Logger.log('   → npm ci --production');
  if (config.build?.command) {
    Logger.log(`   → ${config.build.command}`);
  }
  Logger.br();
  
  Logger.log('4. Backup');
  Logger.log('   → Create timestamped backup of current deployment');
  Logger.br();
  
  Logger.log('5. PM2 Deployment');
  Logger.log(`   → Check if ${config.name}-${environment} exists`);
  Logger.log('   → Start/Reload PM2 process');
  Logger.br();
  
  Logger.log('6. Health Check');
  Logger.log(`   → Poll ${config.health?.path || '/health'}`);
  Logger.log(`   → Retries: ${config.health?.retries || 10}`);
  Logger.br();
  
  Logger.log('7. Cleanup');
  Logger.log(`   → Keep last ${config.backup?.keep || 5} backups`);
  Logger.br();
  
  Logger.info('Use --no-dry-run to execute deployment');
}
