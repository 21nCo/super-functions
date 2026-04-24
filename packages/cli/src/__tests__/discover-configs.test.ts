import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverLibraryConfigs } from '../utils/discover-configs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

vi.mock('../utils/discover-packages.js', () => ({
  discoverSuperfunctionsPackages: vi.fn(() => [
    {
      packageName: '@superfunctions/conduct',
      initFunction: 'createConduct',
      schemaVersion: 1,
      libraryNames: ['conduct'],
    },
    {
      packageName: '@superfunctions/authfn',
      initFunction: 'createAuthFn',
      schemaVersion: 1,
      libraryNames: ['authfn'],
    },
  ]),
}));

describe('discoverLibraryConfigs', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(__dirname, `test-temp-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should discover config files in root directory', async () => {
    // Create test config files
    fs.writeFileSync(
      path.join(testDir, 'conduct.config.ts'),
      'export const config = {};'
    );
    fs.writeFileSync(
      path.join(testDir, 'authfn.config.js'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          libraryName: 'conduct',
          packageName: '@superfunctions/conduct',
        }),
        expect.objectContaining({
          libraryName: 'authfn',
          packageName: '@superfunctions/authfn',
        }),
      ])
    );
  });

  it('should discover config files in src directory', async () => {
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'conduct.config.ts'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      libraryName: 'conduct',
      packageName: '@superfunctions/conduct',
    });
    expect(result[0].configPath).toContain('src/conduct.config.ts');
  });

  it('should discover config files in lib directory', async () => {
    const libDir = path.join(testDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'authfn.config.mjs'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      libraryName: 'authfn',
      packageName: '@superfunctions/authfn',
    });
    expect(result[0].configPath).toContain('lib/authfn.config.mjs');
  });

  it('should discover config files in server directory', async () => {
    const serverDir = path.join(testDir, 'server');
    fs.mkdirSync(serverDir, { recursive: true });

    fs.writeFileSync(
      path.join(serverDir, 'conduct.config.js'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      libraryName: 'conduct',
      packageName: '@superfunctions/conduct',
    });
    expect(result[0].configPath).toContain('server/conduct.config.js');
  });

  it('should ignore files in node_modules', async () => {
    const nodeModulesDir = path.join(testDir, 'node_modules', 'some-package');
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    fs.writeFileSync(
      path.join(nodeModulesDir, 'conduct.config.ts'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(0);
  });

  it('should ignore files in dist directory', async () => {
    const distDir = path.join(testDir, 'dist');
    fs.mkdirSync(distDir, { recursive: true });

    fs.writeFileSync(
      path.join(distDir, 'conduct.config.js'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(0);
  });

  it('should ignore files in build directory', async () => {
    const buildDir = path.join(testDir, 'build');
    fs.mkdirSync(buildDir, { recursive: true });

    fs.writeFileSync(
      path.join(buildDir, 'conduct.config.js'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(0);
  });

  it('should only discover configs for installed libraries', async () => {
    const { discoverSuperfunctionsPackages } = await import('../utils/discover-packages.js');
    
    // Mock to only have conduct installed
    vi.mocked(discoverSuperfunctionsPackages).mockReturnValue([
      {
        packageName: '@superfunctions/conduct',
        initFunction: 'createConduct',
        schemaVersion: 1,
        libraryNames: ['conduct'],
      },
    ]);

    fs.writeFileSync(
      path.join(testDir, 'conduct.config.ts'),
      'export const config = {};'
    );
    fs.writeFileSync(
      path.join(testDir, 'authfn.config.ts'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    // Should only find conduct since authfn is not "installed"
    expect(result).toHaveLength(1);
    expect(result[0].libraryName).toBe('conduct');
  });

  it('should support manual discovery paths', async () => {
    const customDir = path.join(testDir, 'custom', 'configs');
    fs.mkdirSync(customDir, { recursive: true });

    fs.writeFileSync(
      path.join(customDir, 'my-conduct.config.ts'),
      "import type { ConductSchemaConfig } from 'conduct';\nexport const config: ConductSchemaConfig = {};"
    );

    const result = await discoverLibraryConfigs(testDir, [
      'custom/configs/my-conduct.config.ts',
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      libraryName: 'conduct',
      packageName: '@superfunctions/conduct',
    });
    expect(result[0].configPath).toContain('custom/configs/my-conduct.config.ts');
  });

  it('should extract library name from import statement', async () => {
    const customDir = path.join(testDir, 'configs');
    fs.mkdirSync(customDir, { recursive: true });

    // Test with @superfunctions/ prefix
    fs.writeFileSync(
      path.join(customDir, 'custom1.config.ts'),
      "import { something } from '@superfunctions/authfn';\nexport const config = {};"
    );

    // Test without @superfunctions/ prefix
    fs.writeFileSync(
      path.join(customDir, 'custom2.config.ts'),
      "import { something } from 'conduct';\nexport const config = {};"
    );

    const result = await discoverLibraryConfigs(testDir, [
      'configs/custom1.config.ts',
      'configs/custom2.config.ts',
    ]);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ libraryName: 'authfn' }),
        expect.objectContaining({ libraryName: 'conduct' }),
      ])
    );
  });

  it('should handle multiple config files in nested directories', async () => {
    const { discoverSuperfunctionsPackages } = await import('../utils/discover-packages.js');
    
    // Reset mock to have both libraries
    vi.mocked(discoverSuperfunctionsPackages).mockReturnValue([
      {
        packageName: '@superfunctions/conduct',
        initFunction: 'createConduct',
        schemaVersion: 1,
        libraryNames: ['conduct'],
      },
      {
        packageName: '@superfunctions/authfn',
        initFunction: 'createAuthFn',
        schemaVersion: 1,
        libraryNames: ['authfn'],
      },
    ]);
    
    const srcDir = path.join(testDir, 'src', 'config');
    const libDir = path.join(testDir, 'lib', 'server');
    
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'conduct.config.ts'),
      'export const config = {};'
    );
    fs.writeFileSync(
      path.join(libDir, 'authfn.config.js'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.libraryName).sort()).toEqual(['authfn', 'conduct']);
  });

  it('should return absolute paths for discovered configs', async () => {
    fs.writeFileSync(
      path.join(testDir, 'conduct.config.ts'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(1);
    expect(path.isAbsolute(result[0].configPath)).toBe(true);
  });

  it('should return empty array when no configs found', async () => {
    const result = await discoverLibraryConfigs(testDir);

    expect(result).toEqual([]);
  });

  it('should ignore manual paths that do not exist', async () => {
    const result = await discoverLibraryConfigs(testDir, [
      'nonexistent/path/conduct.config.ts',
    ]);

    expect(result).toEqual([]);
  });

  it('should handle manual paths without valid import statements', async () => {
    const customDir = path.join(testDir, 'configs');
    fs.mkdirSync(customDir, { recursive: true });

    fs.writeFileSync(
      path.join(customDir, 'invalid.config.ts'),
      'export const config = {}; // no imports'
    );

    const result = await discoverLibraryConfigs(testDir, [
      'configs/invalid.config.ts',
    ]);

    // Should not include configs without identifiable library name
    expect(result).toEqual([]);
  });

  it('should support all valid file extensions (.ts, .js, .mjs)', async () => {
    fs.writeFileSync(
      path.join(testDir, 'conduct.config.ts'),
      'export const config = {};'
    );
    fs.writeFileSync(
      path.join(testDir, 'authfn.config.js'),
      'export const config = {};'
    );
    
    const { discoverSuperfunctionsPackages } = await import('../utils/discover-packages.js');
    vi.mocked(discoverSuperfunctionsPackages).mockReturnValue([
      {
        packageName: '@superfunctions/conduct',
        initFunction: 'createConduct',
        schemaVersion: 1,
        libraryNames: ['conduct'],
      },
      {
        packageName: '@superfunctions/authfn',
        initFunction: 'createAuthFn',
        schemaVersion: 1,
        libraryNames: ['authfn'],
      },
      {
        packageName: '@superfunctions/sendfn',
        initFunction: 'createSendFn',
        schemaVersion: 1,
        libraryNames: ['sendfn'],
      },
    ]);
    
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'sendfn.config.mjs'),
      'export const config = {};'
    );

    const result = await discoverLibraryConfigs(testDir);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.libraryName).sort()).toEqual(['authfn', 'conduct', 'sendfn']);
  });
});
