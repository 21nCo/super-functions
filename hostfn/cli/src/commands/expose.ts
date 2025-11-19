import ora from 'ora';
import { Logger } from '../utils/logger.js';
import { ConfigLoader } from '../config/loader.js';
import { createSSHConnection } from '../core/ssh.js';
import { NginxConfigGenerator, type NginxServiceConfig } from '../core/nginx.js';
import type { SSHConnection } from '../core/ssh.js';

export async function exposeCommand(environment: string, options: { 
  host?: string;
  skipSsl?: boolean;
  force?: boolean;
}) {
  Logger.header('Expose Services via Nginx');
  
  // Load configuration
  const config = ConfigLoader.load();
  const envConfig = config.environments[environment];
  
  if (!envConfig) {
    throw new Error(
      `Environment '${environment}' not found in configuration\n` +
      `Available: ${Object.keys(config.environments).join(', ')}`
    );
  }

  const host = options.host || envConfig.server;
  const domainConfig = envConfig.domain;
  // Handle both single domain string and array of domains
  const domains = domainConfig ? (Array.isArray(domainConfig) ? domainConfig : [domainConfig]) : [];
  const sslEmail = envConfig.sslEmail;
  const shouldSetupSsl = !options.skipSsl && domains.length > 0 && !!sslEmail;

  Logger.kv('Environment', environment);
  Logger.kv('Server', host);
  Logger.kv('Domain(s)', domains.length > 0 ? domains.join(', ') : 'None (using IP)');
  Logger.kv('SSL', shouldSetupSsl ? `Yes (${sslEmail})` : 'No');
  Logger.br();

  let ssh: SSHConnection | null = null;

  try {
    // Connect to server
    const connectSpinner = ora('Connecting to server...').start();
    ssh = await createSSHConnection(host);
    connectSpinner.succeed('Connected to server');
    Logger.br();

    // Check if nginx is installed
    Logger.section('Checking Prerequisites');
    Logger.br();
    
    const nginxCheck = await ssh.exec('command -v nginx || echo "missing"');
    if (nginxCheck.stdout.includes('missing')) {
      throw new Error(
        'Nginx is not installed on the server.\n' +
        'Run: hostfn server setup <host> --env ' + environment
      );
    }

    const nginxSpinner = ora('Checking nginx installation...').start();
    nginxSpinner.succeed('Nginx is installed');

    if (shouldSetupSsl) {
      const certbotCheck = await ssh.exec('command -v certbot || echo "missing"');
      if (certbotCheck.stdout.includes('missing')) {
        throw new Error(
          'Certbot is not installed on the server.\n' +
          'Run: hostfn server setup <host> --env ' + environment
        );
      }
      const certbotSpinner = ora('Checking certbot installation...').start();
      certbotSpinner.succeed('Certbot is installed');
    }

    Logger.br();

    // Determine nginx config system (sites-available vs conf.d)
    const sitesAvailableCheck = await ssh.exec('test -d /etc/nginx/sites-available && echo "exists"');
    const useSitesAvailable = sitesAvailableCheck.stdout.trim() === 'exists';

    // Disable default site if using sites-available and domain is configured
    // This prevents conflicts when certbot modifies the default site
    if (useSitesAvailable && domains.length > 0) {
      const defaultSiteCheck = await ssh.exec('test -L /etc/nginx/sites-enabled/default && echo "exists"');
      if (defaultSiteCheck.stdout.trim() === 'exists') {
        const disableSpinner = ora('Disabling default nginx site...').start();
        await ssh.exec('sudo unlink /etc/nginx/sites-enabled/default');
        disableSpinner.succeed('Default site disabled');
      }
    }

    // Check if SSL certificates already exist for all domains
    let certsExist = false;
    if (shouldSetupSsl && domains.length > 0) {
      // Check if certificate exists for the primary domain (first in the list)
      const primaryDomain = domains[0];
      const safePrimaryDomain = `'${primaryDomain.replace(/'/g, "'\\''")}'`;
      const certCheck = await ssh.exec(`sudo test -d /etc/letsencrypt/live/${safePrimaryDomain} && echo "exists"`);
      certsExist = certCheck.stdout.trim() === 'exists';
    }

    // Prepare services configuration
    const services: NginxServiceConfig[] = [];

    if (config.services && Object.keys(config.services).length > 0) {
      // Multiple services (monorepo)
      Logger.section('Configuring Multiple Services');
      Logger.br();

      for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
        const serviceEnvConfig = {
          ...envConfig,
          server: serviceConfig.server || envConfig.server,
        };

        // Only include services on this server
        if (serviceEnvConfig.server === host) {
          const port = serviceConfig.port;
          // Validate port
          if (!port || isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
            throw new Error(`Invalid port for service '${serviceName}': ${port}. Must be between 1 and 65535.`);
          }

          const isDefault = !serviceConfig.exposePath;
          services.push({
            name: `${config.name}-${serviceName}`,
            port: Number(port),
            exposePath: serviceConfig.exposePath,
            isDefault,
          });

          Logger.kv(
            serviceName,
            serviceConfig.exposePath 
              ? `Port ${serviceConfig.port} → ${serviceConfig.exposePath}`
              : `Port ${serviceConfig.port} → / (default)`
          );
        }
      }
      Logger.br();
    } else {
      // Single service
      Logger.section('Configuring Single Service');
      Logger.br();
      
      const port = envConfig.port;
      // Validate port
      if (!port || isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
        throw new Error(`Invalid port for environment '${environment}': ${port}. Must be between 1 and 65535.`);
      }

      services.push({
        name: `${config.name}-${environment}`,
        port: Number(port),
        isDefault: true,
      });

      Logger.kv('Service', `${config.name}-${environment}`);
      Logger.kv('Port', envConfig.port.toString());
      Logger.br();
    }

    if (services.length === 0) {
      Logger.warn('No services found to expose on this server');
      return;
    }

    // Generate nginx configuration
    Logger.section('Generating Nginx Configuration');
    Logger.br();

    // Only enable SSL in nginx config if certificates already exist
    // Certbot will update the config to add SSL when obtaining new certificates
    const enableSslInConfig = shouldSetupSsl && certsExist;
    
    if (shouldSetupSsl && !certsExist) {
      Logger.info('SSL certificates not found - will configure after obtaining certificates');
      Logger.br();
    }

    const nginxConfig = NginxConfigGenerator.generate({
      domain: domains.length > 0 ? domains : undefined,
      ssl: enableSslInConfig,
      services,
      environment,
    });

    const configPath = NginxConfigGenerator.getConfigPath(environment, useSitesAvailable);
    
    Logger.info('Configuration preview:');
    Logger.br();
    Logger.log(nginxConfig);
    Logger.br();

    // Check if config already exists
    const existsCheck = await ssh.exec(`test -f ${configPath} && echo "exists"`);
    const configExists = existsCheck.stdout.trim() === 'exists';

    let shouldWrite = !configExists || options.force;

    // If config exists, check if domain has changed
    if (configExists && !options.force && domains.length > 0) {
      const currentConfigResult = await ssh.exec(`cat ${configPath}`);
      const currentConfig = currentConfigResult.stdout;
      
      // Check if the current config has a different server_name or uses catch-all
      const serverNameMatch = currentConfig.match(/server_name\s+([^;]+);/);
      if (serverNameMatch) {
        const currentServerName = serverNameMatch[1].trim();
        const newServerName = domains.join(' ');
        // If current is catch-all (_) or different domain(s), force update
        if (currentServerName === '_' || currentServerName !== newServerName) {
          Logger.info(`Updating server_name from "${currentServerName}" to "${newServerName}"`);
          Logger.br();
          shouldWrite = true;
        }
      }
    }

    if (configExists && !shouldWrite) {
      Logger.warn(`Configuration already exists at ${configPath}`);
      Logger.info('Use --force to overwrite');
      Logger.br();
      Logger.info('Skipping to SSL setup...');
      Logger.br();
    } else {
      const writeSpinner = ora('Writing nginx configuration...').start();

      // Write nginx config
      await ssh.exec(`sudo tee ${configPath} > /dev/null << 'EOF'
${nginxConfig}
EOF`);

      // Enable site if using sites-available
      const enableCmd = NginxConfigGenerator.getEnableCommand(environment, useSitesAvailable);
      if (enableCmd) {
        await ssh.exec(`sudo ${enableCmd}`);
      }

      writeSpinner.succeed(`Configuration written to ${configPath}`);
    }

    // Test nginx configuration
    const testSpinner = ora('Testing nginx configuration...').start();
    const testResult = await ssh.exec('sudo nginx -t');
    
    if (testResult.exitCode !== 0) {
      testSpinner.fail('Nginx configuration test failed');
      Logger.error(testResult.stderr);
      throw new Error('Invalid nginx configuration');
    }
    testSpinner.succeed('Nginx configuration is valid');

    // Reload nginx
    const reloadSpinner = ora('Reloading nginx...').start();
    await ssh.exec('sudo systemctl reload nginx');
    reloadSpinner.succeed('Nginx reloaded');

    Logger.br();

    // Setup SSL if domains are configured
    if (shouldSetupSsl && domains.length > 0 && sslEmail) {
      await setupSSL(ssh, host, domains, sslEmail, environment);
    }

    // Success summary
    Logger.br();
    Logger.success('Services exposed successfully!');
    Logger.br();

    if (shouldSetupSsl && domains.length > 0) {
      for (const domain of domains) {
        Logger.kv('URL', `https://${domain}`);
      }
    } else if (domains.length > 0) {
      for (const domain of domains) {
        Logger.kv('URL', `http://${domain}`);
      }
    } else {
      const hostname = host.includes('@') ? host.split('@')[1] : host;
      Logger.kv('URL', `http://${hostname}`);
    }

    Logger.br();
    Logger.info('Service endpoints:');
    for (const service of services) {
      const path = service.exposePath || '/';
      Logger.log(`  ${service.name}: ${path}`);
    }
    Logger.br();

  } catch (error) {
    Logger.br();
    Logger.error('Failed to expose services');
    Logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    if (ssh) {
      ssh.disconnect();
    }
  }
}

/**
 * Setup SSL certificate using certbot
 */
async function setupSSL(
  ssh: SSHConnection,
  host: string,
  domains: string[],
  email: string,
  environment: string
): Promise<void> {
  Logger.section('Setting up SSL Certificates');
  Logger.br();

  // Use the primary domain (first in the list) for certificate name
  const primaryDomain = domains[0];
  Logger.info(`Primary domain: ${primaryDomain}`);
  if (domains.length > 1) {
    Logger.info(`Additional domains: ${domains.slice(1).join(', ')}`);
  }
  Logger.br();

  // Check if certificate already exists for primary domain
  const certCheckSpinner = ora('Checking for existing certificate...').start();
  const certCheck = await ssh.exec(`sudo test -d /etc/letsencrypt/live/${primaryDomain} && echo "exists"`);
  const certExists = certCheck.stdout.trim() === 'exists';

  if (certExists) {
    certCheckSpinner.succeed('Certificate already exists');
    
    // Check if certificate contains all required domains
    const checkDomainsSpinner = ora('Checking certificate domains...').start();
    const certInfoResult = await ssh.exec(`sudo certbot certificates --cert-name ${primaryDomain} 2>/dev/null | grep "Domains:" || echo ""`);
    const certDomainsLine = certInfoResult.stdout.trim();
    
    let needsExpansion = false;
    if (certDomainsLine) {
      // Extract domains from "Domains: domain1 domain2 domain3"
      const existingDomains = certDomainsLine
        .replace(/^.*Domains:\s*/, '')
        .split(/\s+/)
        .filter(d => d.length > 0);
      
      // Check if all required domains are in the certificate
      needsExpansion = domains.some(domain => !existingDomains.includes(domain));
      
      if (needsExpansion) {
        checkDomainsSpinner.info(`Certificate missing domains: ${domains.filter(d => !existingDomains.includes(d)).join(', ')}`);
      } else {
        checkDomainsSpinner.succeed('Certificate contains all required domains');
      }
    } else {
      checkDomainsSpinner.warn('Could not verify certificate domains, will attempt expansion');
      needsExpansion = true;
    }
    
    if (needsExpansion) {
      // Expand certificate to include all domains
      const expandSpinner = ora(`Expanding certificate to include ${domains.length} domain(s)...`).start();
      expandSpinner.text = 'This may take a minute...';
      
      const domainFlags = domains.map(d => `-d ${d}`).join(' ');
      const expandCmd = [
        'sudo certbot --nginx',
        domainFlags,
        `--email ${email}`,
        '--non-interactive',
        '--agree-tos',
        '--redirect',
        '--expand',
      ].join(' ');
      
      const expandResult = await ssh.exec(expandCmd, { streaming: false });
      
      if (expandResult.exitCode === 0) {
        expandSpinner.succeed(`Certificate expanded successfully for all ${domains.length} domain(s)`);
      } else {
        expandSpinner.fail('Failed to expand SSL certificate');
        Logger.br();
        Logger.error('Certbot error:');
        Logger.log(expandResult.stderr || expandResult.stdout);
        Logger.br();
        Logger.warn('SSL expansion failed');
        Logger.info('You can manually run certbot with --expand:');
        const manualDomainFlags = domains.map(d => `-d ${d}`).join(' ');
        Logger.command(`ssh ${host} "sudo certbot --nginx ${manualDomainFlags} --expand"`);
        return;
      }
    } else {
      // Just renew the existing certificate
      const renewSpinner = ora('Renewing certificate...').start();
      const renewResult = await ssh.exec(`sudo certbot renew --cert-name ${primaryDomain} --nginx --non-interactive`);
      
      if (renewResult.exitCode === 0) {
        renewSpinner.succeed('Certificate renewed (or still valid)');
      } else {
        renewSpinner.warn('Certificate renewal skipped (likely still valid)');
      }
    }
  } else {
    certCheckSpinner.succeed('No existing certificate found');
    
    // Obtain new certificate for all domains
    const obtainSpinner = ora(`Obtaining SSL certificate for ${domains.length} domain(s)...`).start();
    obtainSpinner.text = 'This may take a minute...';
    
    // Build certbot command with all domains
    const domainFlags = domains.map(d => `-d ${d}`).join(' ');
    const certbotCmd = [
      'sudo certbot --nginx',
      domainFlags,
      `--email ${email}`,
      '--non-interactive',
      '--agree-tos',
      '--redirect',
    ].join(' ');

    const certbotResult = await ssh.exec(certbotCmd, { streaming: false });
    
    if (certbotResult.exitCode === 0) {
      obtainSpinner.succeed(`SSL certificate obtained successfully for all ${domains.length} domain(s)`);
    } else {
      obtainSpinner.fail('Failed to obtain SSL certificate');
      Logger.br();
      Logger.error('Certbot error:');
      Logger.log(certbotResult.stderr || certbotResult.stdout);
      Logger.br();
      Logger.warn('SSL setup failed, but nginx is still configured for HTTP');
      Logger.info('You can manually run certbot later:');
      const manualDomainFlags = domains.map(d => `-d ${d}`).join(' ');
      Logger.command(`ssh ${host} "sudo certbot --nginx ${manualDomainFlags}"`);
      return;
    }
  }

  // Verify SSL is working
  const verifySpinner = ora('Verifying SSL configuration...').start();
  const sslCheck = await ssh.exec(`sudo nginx -t`);
  
  if (sslCheck.exitCode === 0) {
    verifySpinner.succeed('SSL configuration verified');
  } else {
    verifySpinner.warn('SSL verification had warnings (may still work)');
  }

  Logger.br();
  Logger.success('SSL certificate configured!');
  Logger.info('Auto-renewal is enabled via certbot');
  Logger.br();
}
