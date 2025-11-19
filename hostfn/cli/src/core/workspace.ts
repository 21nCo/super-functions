import { readFileSync, writeFileSync, existsSync, cpSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { Logger } from '../utils/logger.js';

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  scripts?: Record<string, string>;
}

export class WorkspaceManager {
  private workspaceRoot: string | null = null;
  private workspacePackages: Map<string, string> = new Map();

  async detectWorkspace(cwd: string): Promise<boolean> {
    let currentDir = cwd;
    const root = resolve('/');

    while (currentDir !== root) {
      const pkgPath = join(currentDir, 'package.json');
      
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
        
        if (pkg.workspaces) {
          this.workspaceRoot = currentDir;
          await this.indexWorkspacePackages();
          return true;
        }
      }
      
      currentDir = dirname(currentDir);
    }

    return false;
  }

  private async indexWorkspacePackages(): Promise<void> {
    if (!this.workspaceRoot) return;

    const rootPkg = this.readPackageJson(this.workspaceRoot);
    if (!rootPkg?.workspaces) return;

    const workspaces = Array.isArray(rootPkg.workspaces)
      ? rootPkg.workspaces
      : rootPkg.workspaces.packages;

    const glob = await import('fast-glob');
    
    for (const pattern of workspaces) {
      const matches = await glob.default(join(this.workspaceRoot, pattern, 'package.json'), {
        absolute: true,
      });

      for (const pkgPath of matches) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;
        if (pkg.name) {
          this.workspacePackages.set(pkg.name, dirname(pkgPath));
        }
      }
    }
  }

  getWorkspaceDependencies(servicePath: string): string[] {
    const pkg = this.readPackageJson(servicePath);
    if (!pkg) return [];

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const workspaceDeps: string[] = [];

    for (const [depName, depVersion] of Object.entries(allDeps)) {
      if (depVersion === '*' || depVersion === 'workspace:*' || depVersion.startsWith('workspace:')) {
        if (this.workspacePackages.has(depName)) {
          workspaceDeps.push(depName);
        }
      }
    }

    return workspaceDeps;
  }

  async bundleWorkspaceDependencies(servicePath: string, targetDir: string): Promise<void> {
    const workspaceDeps = this.getWorkspaceDependencies(servicePath);
    
    if (workspaceDeps.length === 0) {
      return;
    }

    Logger.info(`Bundling ${workspaceDeps.length} workspace dependencies...`);

    const nodeModulesDir = join(targetDir, 'node_modules');
    mkdirSync(nodeModulesDir, { recursive: true });
    
    for (const depName of workspaceDeps) {
      const depPath = this.workspacePackages.get(depName);
      if (!depPath) continue;

      const depPkg = this.readPackageJson(depPath);
      if (depPkg?.scripts?.build) {
        Logger.log(`  → Building ${depName}...`);
        try {
          const { execSync } = await import('child_process');
          execSync('npm run build', { cwd: depPath, stdio: 'ignore' });
        } catch (error) {
          Logger.warn(`  ⚠ Failed to build ${depName}, bundling as-is`);
        }
      }

      const targetDepDir = join(nodeModulesDir, depName);
      
      mkdirSync(dirname(targetDepDir), { recursive: true });

      cpSync(depPath, targetDepDir, {
        recursive: true,
        filter: (src) => {
          const relativePath = src.replace(depPath, '');
          return !relativePath.includes('node_modules') &&
                 !relativePath.includes('.git');
        },
      });

      Logger.log(`  ✓ Bundled ${depName}`);
    }
  }

  rewritePackageJson(servicePath: string, targetDir: string): void {
    const workspaceDeps = this.getWorkspaceDependencies(servicePath);
    
    if (workspaceDeps.length === 0) {
      return;
    }

    const pkgPath = join(targetDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJson;

    if (pkg.dependencies) {
      for (const depName of workspaceDeps) {
        if (pkg.dependencies[depName]) {
          pkg.dependencies[depName] = `file:./node_modules/${depName}`;
        }
      }
    }

    if (pkg.devDependencies) {
      for (const depName of workspaceDeps) {
        if (pkg.devDependencies[depName]) {
          delete pkg.devDependencies[depName];
        }
      }
    }

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  private readPackageJson(dir: string): PackageJson | null {
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) return null;
    
    try {
      return JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  isInWorkspace(): boolean {
    return this.workspaceRoot !== null;
  }
}
