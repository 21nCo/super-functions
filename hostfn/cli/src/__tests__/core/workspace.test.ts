import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WorkspaceManager } from '../../core/workspace.js';

const execSyncMock = vi.fn();

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

describe('WorkspaceManager.generateLockfile', () => {
  let rootDir: string;
  let serviceDir: string;
  let targetDir: string;

  beforeEach(() => {
    execSyncMock.mockReset();
    rootDir = mkdtempSync(join(tmpdir(), 'hostfn-workspace-root-'));
    serviceDir = join(rootDir, 'services', 'api');
    targetDir = mkdtempSync(join(tmpdir(), 'hostfn-workspace-target-'));

    mkdirSync(serviceDir, { recursive: true });

    writeFileSync(
      join(rootDir, 'package.json'),
      JSON.stringify({
        private: true,
        workspaces: ['services/*'],
      }, null, 2),
    );

    writeFileSync(
      join(serviceDir, 'package.json'),
      JSON.stringify({
        name: '@hostfn/api',
        dependencies: {
          commander: '^12.0.0',
          chalk: '^5.0.0',
          'zero-lib': '^0.2.3',
        },
      }, null, 2),
    );

    writeFileSync(
      join(rootDir, 'package-lock.json'),
      JSON.stringify({
        name: 'workspace-root',
        lockfileVersion: 3,
        packages: {
          '': { name: 'workspace-root' },
          'node_modules/commander': { version: '4.1.1', name: 'commander' },
          'services/api/node_modules/commander': { version: '12.1.0', name: 'commander' },
          'node_modules/chalk': { version: '5.3.0', name: 'chalk' },
          'node_modules/zero-lib': { version: '0.5.0', name: 'zero-lib' },
          'services/api/node_modules/zero-lib': { version: '0.2.8', name: 'zero-lib' },
        },
      }, null, 2),
    );

    writeFileSync(
      join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@hostfn/api',
        dependencies: {
          commander: '^12.0.0',
          chalk: '^5.0.0',
          'zero-lib': '^0.2.3',
        },
      }, null, 2),
    );
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it('pins package.json to the exact workspace-scoped versions used for lockfile generation', async () => {
    execSyncMock.mockImplementation(() => {
      const pinnedPackageJson = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf-8'));
      expect(pinnedPackageJson.dependencies.commander).toBe('12.1.0');
      expect(pinnedPackageJson.dependencies.chalk).toBe('5.3.0');
      expect(pinnedPackageJson.dependencies['zero-lib']).toBe('0.2.8');
    });

    const manager = new WorkspaceManager();
    await manager.detectWorkspace(serviceDir);
    await manager.generateLockfile(targetDir, serviceDir);

    expect(execSyncMock).toHaveBeenCalledWith(
      'npm install --package-lock-only --ignore-scripts',
      expect.objectContaining({
        cwd: targetDir,
        stdio: 'ignore',
      }),
    );

    const deployedPackageJson = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf-8'));
    expect(deployedPackageJson.dependencies.commander).toBe('12.1.0');
    expect(deployedPackageJson.dependencies.chalk).toBe('5.3.0');
    expect(deployedPackageJson.dependencies['zero-lib']).toBe('0.2.8');
  });
});

describe('WorkspaceManager.rewritePackageJson', () => {
  let rootDir: string;
  let serviceDir: string;
  let toolingDir: string;
  let targetDir: string;

  beforeEach(async () => {
    rootDir = mkdtempSync(join(tmpdir(), 'hostfn-workspace-root-'));
    serviceDir = join(rootDir, 'services', 'api');
    toolingDir = join(rootDir, 'services', 'tooling');
    targetDir = mkdtempSync(join(tmpdir(), 'hostfn-workspace-target-'));

    mkdirSync(serviceDir, { recursive: true });
    mkdirSync(toolingDir, { recursive: true });

    writeFileSync(
      join(rootDir, 'package.json'),
      JSON.stringify({
        private: true,
        workspaces: ['services/*'],
      }, null, 2),
    );

    writeFileSync(
      join(toolingDir, 'package.json'),
      JSON.stringify({
        name: '@hostfn/tooling',
        version: '1.0.0',
      }, null, 2),
    );

    writeFileSync(
      join(serviceDir, 'package.json'),
      JSON.stringify({
        name: '@hostfn/api',
        dependencies: {
          '@hostfn/tooling': 'workspace:*',
        },
        devDependencies: {
          '@hostfn/tooling': 'workspace:*',
        },
      }, null, 2),
    );

    writeFileSync(
      join(targetDir, 'package.json'),
      JSON.stringify({
        name: '@hostfn/api',
        dependencies: {
          '@hostfn/tooling': 'workspace:*',
        },
        devDependencies: {
          '@hostfn/tooling': 'workspace:*',
        },
      }, null, 2),
    );
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
  });

  it('preserves workspace devDependencies as file references in the deployment bundle', async () => {
    const manager = new WorkspaceManager();
    await manager.detectWorkspace(serviceDir);

    manager.rewritePackageJson(serviceDir, targetDir);

    const rewrittenPackageJson = JSON.parse(readFileSync(join(targetDir, 'package.json'), 'utf-8'));
    expect(rewrittenPackageJson.dependencies['@hostfn/tooling']).toBe('file:./__workspace__/@hostfn/tooling');
    expect(rewrittenPackageJson.devDependencies['@hostfn/tooling']).toBe('file:./__workspace__/@hostfn/tooling');
  });
});
