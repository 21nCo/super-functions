import { describe, it, expect } from 'vitest';
import { NginxConfigGenerator } from '../../core/nginx.js';

describe('NginxConfigGenerator - Multi-Domain Support', () => {
  describe('generate with single domain (backward compatibility)', () => {
    it('should generate config with single domain string', () => {
      const config = NginxConfigGenerator.generate({
        domain: 'example.com',
        ssl: false,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      expect(config).toContain('server_name example.com;');
      expect(config).toContain('proxy_pass http://localhost:3000;');
    });

    it('should generate SSL config with single domain', () => {
      const config = NginxConfigGenerator.generate({
        domain: 'example.com',
        ssl: true,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      expect(config).toContain('server_name example.com;');
      expect(config).toContain('listen 443 ssl http2;');
      expect(config).toContain('ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;');
      expect(config).toContain('ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;');
    });
  });

  describe('generate with multiple domains', () => {
    it('should generate config with multiple domains in server_name', () => {
      const config = NginxConfigGenerator.generate({
        domain: ['example.com', 'www.example.com', 'app.example.com'],
        ssl: false,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      expect(config).toContain('server_name example.com www.example.com app.example.com;');
      expect(config).toContain('proxy_pass http://localhost:3000;');
    });

    it('should use primary domain for SSL certificate paths', () => {
      const config = NginxConfigGenerator.generate({
        domain: ['example.com', 'www.example.com', 'api.example.com'],
        ssl: true,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      // Should have all domains in server_name
      expect(config).toContain('server_name example.com www.example.com api.example.com;');
      
      // Should use first domain (primary) for certificate paths
      expect(config).toContain('ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;');
      expect(config).toContain('ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;');
      
      // Should NOT use other domains for cert paths
      expect(config).not.toContain('ssl_certificate /etc/letsencrypt/live/www.example.com/');
      expect(config).not.toContain('ssl_certificate /etc/letsencrypt/live/api.example.com/');
    });

    it('should generate HTTP redirect block for all domains', () => {
      const config = NginxConfigGenerator.generate({
        domain: ['example.com', 'www.example.com'],
        ssl: true,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      // Should have redirect block
      expect(config).toContain('return 301 https://$host$request_uri;');
      
      // Should have two server blocks (HTTPS + redirect)
      const serverBlocks = config.match(/server \{/g);
      expect(serverBlocks).toHaveLength(2);
    });
  });

  describe('generate without domain', () => {
    it('should use catch-all server_name when no domain provided', () => {
      const config = NginxConfigGenerator.generate({
        ssl: false,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      expect(config).toContain('server_name _;');
    });

    it('should use catch-all server_name with empty array', () => {
      const config = NginxConfigGenerator.generate({
        domain: [],
        ssl: false,
        services: [
          {
            name: 'test-app',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      expect(config).toContain('server_name _;');
    });
  });

  describe('generate with multiple services and multiple domains', () => {
    it('should handle path-based routing with multiple domains', () => {
      const config = NginxConfigGenerator.generate({
        domain: ['example.com', 'www.example.com'],
        ssl: false,
        services: [
          {
            name: 'api-service',
            port: 3001,
            exposePath: '/api',
            isDefault: false,
          },
          {
            name: 'web-service',
            port: 3000,
            isDefault: true,
          },
        ],
        environment: 'production',
      });

      expect(config).toContain('server_name example.com www.example.com;');
      expect(config).toContain('location /api {');
      expect(config).toContain('proxy_pass http://localhost:3001;');
      expect(config).toContain('location / {');
      expect(config).toContain('proxy_pass http://localhost:3000;');
    });
  });
});
