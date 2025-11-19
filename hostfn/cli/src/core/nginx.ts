import type { HostfnConfig, ServiceConfig } from '../config/schema.js';

export interface NginxServiceConfig {
  name: string;
  port: number;
  exposePath?: string;
  isDefault?: boolean;
}

export interface NginxConfig {
  domain?: string | string[];
  ssl: boolean;
  services: NginxServiceConfig[];
  environment: string;
}

export class NginxConfigGenerator {
  /**
   * Generate nginx configuration for services
   */
  static generate(config: NginxConfig): string {
    const { domain, ssl, services, environment } = config;
    // Handle both single domain string and array of domains
    const domains = domain ? (Array.isArray(domain) ? domain : [domain]) : [];
    const serverName = domains.length > 0 ? domains.join(' ') : '_';
    
    // Separate default and path-based services
    const defaultService = services.find(s => s.isDefault);
    const pathServices = services.filter(s => !s.isDefault && s.exposePath);
    
    let nginxConfig = '';

    if (ssl) {
      // HTTPS server block
      nginxConfig += this.generateHttpsBlock(serverName, defaultService, pathServices);
      nginxConfig += '\n\n';
      // HTTP redirect block
      nginxConfig += this.generateHttpRedirectBlock(serverName);
    } else {
      // HTTP only server block
      nginxConfig += this.generateHttpBlock(serverName, defaultService, pathServices);
    }

    return nginxConfig;
  }

  /**
   * Generate HTTPS server block
   */
  private static generateHttpsBlock(
    serverName: string,
    defaultService: NginxServiceConfig | undefined,
    pathServices: NginxServiceConfig[]
  ): string {
    // Extract primary domain for certificate path (first domain in the list)
    const primaryDomain = serverName.split(' ')[0];
    let config = `server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${serverName};

    ssl_certificate /etc/letsencrypt/live/${primaryDomain}/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/${primaryDomain}/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
`;

    // Add path-based services first (higher priority)
    for (const service of pathServices) {
      config += this.generateLocationBlock(service);
    }

    // Add default service
    if (defaultService) {
      config += this.generateLocationBlock(defaultService);
    }

    config += '}\n';
    return config;
  }

  /**
   * Generate HTTP server block
   */
  private static generateHttpBlock(
    serverName: string,
    defaultService: NginxServiceConfig | undefined,
    pathServices: NginxServiceConfig[]
  ): string {
    let config = `server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};
`;

    // Add path-based services first (higher priority)
    for (const service of pathServices) {
      config += this.generateLocationBlock(service);
    }

    // Add default service
    if (defaultService) {
      config += this.generateLocationBlock(defaultService);
    }

    config += '}\n';
    return config;
  }

  /**
   * Generate HTTP to HTTPS redirect block
   */
  private static generateHttpRedirectBlock(serverName: string): string {
    return `server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};
    
    location / {
        return 301 https://$host$request_uri;
    }
}`;
  }

  /**
   * Generate location block for a service
   */
  private static generateLocationBlock(service: NginxServiceConfig): string {
    const path = service.exposePath || '/';
    const hasTrailingSlash = path !== '/' && path.endsWith('/');
    const proxyPassPath = hasTrailingSlash ? '/' : '';

    return `
    # ${service.name}
    location ${path} {
        proxy_pass http://localhost:${service.port}${proxyPassPath};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
`;
  }

  /**
   * Get nginx config file path based on the system
   */
  static getConfigPath(environment: string, useSitesAvailable: boolean): string {
    if (useSitesAvailable) {
      return `/etc/nginx/sites-available/hostfn-${environment}`;
    }
    return `/etc/nginx/conf.d/hostfn-${environment}.conf`;
  }

  /**
   * Get command to enable site (for sites-available/sites-enabled systems)
   */
  static getEnableCommand(environment: string, useSitesAvailable: boolean): string | null {
    if (useSitesAvailable) {
      return `ln -sf /etc/nginx/sites-available/hostfn-${environment} /etc/nginx/sites-enabled/hostfn-${environment}`;
    }
    return null;
  }
}
