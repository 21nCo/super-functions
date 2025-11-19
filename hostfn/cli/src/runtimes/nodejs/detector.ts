import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { RuntimeDetectionResult } from '../base.js';

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: {
    node?: string;
  };
}

export class NodeJSDetector {
  /**
   * Detect Node.js project
   */
  static async detect(cwd: string): Promise<RuntimeDetectionResult> {
    const packageJsonPath = resolve(cwd, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return {
        detected: false,
        confidence: 0,
      };
    }

    try {
      const content = readFileSync(packageJsonPath, 'utf-8');
      const pkg: PackageJson = JSON.parse(content);

      // Determine framework
      const framework = this.detectFramework(pkg);
      const packageManager = this.detectPackageManager(cwd);
      const version = this.detectNodeVersion(pkg);

      return {
        detected: true,
        confidence: 100, // package.json exists = 100% Node.js
        version,
        framework,
        packageManager,
        metadata: {
          hasTypeScript: this.hasTypeScript(pkg),
          hasScripts: Object.keys(pkg.scripts || {}).length > 0,
          dependencies: Object.keys(pkg.dependencies || {}).length,
        },
      };
    } catch (error) {
      return {
        detected: false,
        confidence: 0,
      };
    }
  }

  /**
   * Detect framework from dependencies
   */
  private static detectFramework(pkg: PackageJson): string | undefined {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Check for common frameworks (order matters - more specific first)
    if (allDeps['next']) return 'next';
    if (allDeps['@nestjs/core']) return 'nestjs';
    if (allDeps['hono']) return 'hono';
    if (allDeps['fastify']) return 'fastify';
    if (allDeps['express']) return 'express';
    if (allDeps['koa']) return 'koa';
    if (allDeps['@hapi/hapi']) return 'hapi';

    return 'generic';
  }

  /**
   * Detect package manager
   */
  private static detectPackageManager(cwd: string): string {
    if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
    if (existsSync(resolve(cwd, 'package-lock.json'))) return 'npm';
    return 'npm'; // default
  }

  /**
   * Detect Node.js version from engines
   */
  private static detectNodeVersion(pkg: PackageJson): string | undefined {
    if (!pkg.engines?.node) return undefined;

    // Parse version constraint (>=18.0.0 -> 18)
    const match = pkg.engines.node.match(/(\d+)/);
    return match ? match[1] : undefined;
  }

  /**
   * Check if project uses TypeScript
   */
  private static hasTypeScript(pkg: PackageJson): boolean {
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    return 'typescript' in allDeps;
  }

  /**
   * Extract build command from package.json
   */
  static getBuildCommand(pkg: PackageJson): string | undefined {
    const scripts = pkg.scripts || {};
    
    // Common build script names
    if (scripts.build) return 'npm run build';
    if (scripts.compile) return 'npm run compile';
    if (scripts['build:prod']) return 'npm run build:prod';
    
    return undefined;
  }

  /**
   * Extract start command from package.json
   */
  static getStartCommand(pkg: PackageJson): string {
    const scripts = pkg.scripts || {};
    
    // Common start script names
    if (scripts.start) return 'npm start';
    if (scripts['start:prod']) return 'npm run start:prod';
    
    // Fallback: node entry point
    return 'node dist/index.js';
  }

  /**
   * Read package.json
   */
  static readPackageJson(cwd: string): PackageJson | null {
    const packageJsonPath = resolve(cwd, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      return null;
    }

    try {
      const content = readFileSync(packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
