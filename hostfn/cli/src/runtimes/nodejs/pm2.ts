import { ProcessManager, RuntimeConfig } from '../base.js';

/**
 * PM2 process manager for Node.js
 */
export class PM2Manager implements ProcessManager {
  readonly name = 'pm2';

  generateStartCommand(config: RuntimeConfig, environment: string): string {
    const serviceName = `${config.name}-${environment}`;
    const entry = config.start.entry || 'dist/index.js';
    
    return `pm2 start ${entry} --name ${serviceName} -i max --env ${environment}`;
  }

  generateReloadCommand(serviceName: string): string {
    return `pm2 reload ${serviceName} --update-env`;
  }

  generateStopCommand(serviceName: string): string {
    return `pm2 stop ${serviceName}`;
  }

  generateStatusCommand(serviceName: string): string {
    return `pm2 list | grep ${serviceName}`;
  }

  generateLogsCommand(serviceName: string, lines: number = 100): string {
    return `pm2 logs ${serviceName} --lines ${lines}`;
  }

  /**
   * Generate PM2 ecosystem config file content
   */
  generateEcosystemConfig(config: RuntimeConfig, environment: string, envVars: Record<string, string> = {}): string {
    const serviceName = `${config.name}-${environment}`;
    const entry = config.start.entry || 'dist/index.js';
    
    // Merge base env with provided env vars
    const allEnv = {
      NODE_ENV: environment,
      PORT: config.port || 3000,
      ...envVars
    };
    
    // Generate env object string
    const envString = Object.entries(allEnv)
      .map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`)
      .join(',\n');
    
    return `module.exports = {
  apps: [{
    name: '${serviceName}',
    script: '${entry}',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
${envString}
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
`;
  }
}
