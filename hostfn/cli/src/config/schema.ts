import { z } from 'zod';

// Runtime types - extensible for future languages
export const RuntimeSchema = z.enum(['nodejs', 'python', 'go', 'ruby', 'rust', 'docker']);
export type Runtime = z.infer<typeof RuntimeSchema>;

// Environment configuration
export const EnvironmentConfigSchema = z.object({
  server: z.string().describe('SSH connection string (user@host)'),
  port: z.number().int().positive().describe('Port for the service'),
  instances: z.union([z.number().int().positive(), z.literal('max')]).default(1),
  domain: z.union([z.string(), z.array(z.string())]).optional().describe('Domain name(s) for the service - can be a single domain or array of domains'),
  sslEmail: z.string().email().optional().describe('Email for SSL certificate'),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

// Build configuration
export const BuildConfigSchema = z.object({
  command: z.string().describe('Build command to run'),
  directory: z.string().default('dist').describe('Output directory'),
  nodeModules: z.enum(['all', 'production', 'none']).optional(),
}).optional();

export type BuildConfig = z.infer<typeof BuildConfigSchema>;

// Start configuration
export const StartConfigSchema = z.object({
  command: z.string().describe('Start command'),
  entry: z.string().optional().describe('Entry point file'),
});

export type StartConfig = z.infer<typeof StartConfigSchema>;

// Health check configuration
export const HealthCheckConfigSchema = z.object({
  path: z.string().default('/health'),
  timeout: z.number().int().positive().default(60),
  retries: z.number().int().positive().default(10),
  interval: z.number().int().positive().default(3),
}).optional();

export type HealthCheckConfig = z.infer<typeof HealthCheckConfigSchema>;

// Environment variables configuration
export const EnvConfigSchema = z.object({
  required: z.array(z.string()).default([]),
  optional: z.array(z.string()).default([]),
});

export type EnvConfig = z.infer<typeof EnvConfigSchema>;

// Sync configuration
export const SyncConfigSchema = z.object({
  exclude: z.array(z.string()).default([
    'node_modules',
    '.git',
    '.github',
    'dist',
    'build',
    '.env',
    '.env.*',
    '*.log',
    '.turbo',
    '.wrangler',
  ]),
  include: z.array(z.string()).optional(),
}).optional();

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

// Backup configuration
export const BackupConfigSchema = z.object({
  keep: z.number().int().positive().default(5),
}).optional();

export type BackupConfig = z.infer<typeof BackupConfigSchema>;

// Service configuration (for monorepos)
export const ServiceConfigSchema = z.object({
  port: z.number().int().positive(),
  path: z.string().describe('Path in monorepo'),
  domain: z.union([z.string(), z.array(z.string())]).optional().describe('Domain name(s) for this service - can be a single domain or array of domains'),
  exposePath: z.string().optional().describe('Nginx path prefix (e.g., "/api", "/docs")'),
  server: z.string().optional().describe('Override server for this service (defaults to environment server)'),
  instances: z.union([z.number().int().positive(), z.literal('max')]).optional().describe('PM2 instances for this service'),
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

// Main configuration schema
export const HostfnConfigSchema = z.object({
  name: z.string().describe('Application name'),
  runtime: RuntimeSchema.describe('Runtime/language'),
  version: z.string().describe('Runtime version'),
  
  environments: z.record(z.string(), EnvironmentConfigSchema)
    .describe('Environment configurations'),
  
  build: BuildConfigSchema,
  start: StartConfigSchema,
  health: HealthCheckConfigSchema,
  env: EnvConfigSchema.default({ required: [], optional: [] }),
  sync: SyncConfigSchema,
  backup: BackupConfigSchema,
  
  services: z.record(z.string(), ServiceConfigSchema).optional()
    .describe('Multi-service configuration for monorepos'),
});

export type HostfnConfig = z.infer<typeof HostfnConfigSchema>;

// Default configuration for new projects
export const DEFAULT_CONFIG: Partial<HostfnConfig> = {
  health: {
    path: '/health',
    timeout: 60,
    retries: 10,
    interval: 3,
  },
  env: {
    required: [],
    optional: [],
  },
  sync: {
    exclude: [
      'node_modules',
      '.git',
      '.github',
      'dist',
      'build',
      '.env',
      '.env.*',
      '*.log',
    ],
  },
  backup: {
    keep: 5,
  },
};
