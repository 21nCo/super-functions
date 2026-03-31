import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfigModule } from '../utils/load-config-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('loadConfigModule', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, `test-temp-config-module-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('loads a TypeScript default export through the shared runtime loader', async () => {
    const configPath = path.join(testDir, 'extfn.config.ts');
    fs.writeFileSync(
      configPath,
      `
      export default {
        name: 'Example',
        targets: ['chromium-mv3'],
      };
      `,
      'utf8'
    );

    const loaded = await loadConfigModule(configPath);

    expect(loaded.path).toBe(configPath);
    expect(loaded.exportName).toBe('default');
    expect(loaded.value).toEqual({
      name: 'Example',
      targets: ['chromium-mv3'],
    });
  });

  it('loads a named config export without requiring a second TS loader', async () => {
    const configPath = path.join(testDir, 'tool.config.ts');
    fs.writeFileSync(
      configPath,
      `
      export const config = {
        source: 'named',
        enabled: true,
      };
      `,
      'utf8'
    );

    const loaded = await loadConfigModule(configPath, {
      exportNames: ['config'],
      fallbackToModule: false,
    });

    expect(loaded.exportName).toBe('config');
    expect(loaded.value).toEqual({
      source: 'named',
      enabled: true,
    });
  });

  it('supports callers that need named exports to win over default exports', async () => {
    const configPath = path.join(testDir, 'tool.config.ts');
    fs.writeFileSync(
      configPath,
      `
      export const config = {
        source: 'named',
      };

      export default {
        source: 'default',
      };
      `,
      'utf8'
    );

    const loaded = await loadConfigModule(configPath, {
      exportNames: ['config'],
      exportPriority: 'named-first',
      fallbackToModule: false,
    });

    expect(loaded.exportName).toBe('config');
    expect(loaded.value).toEqual({
      source: 'named',
    });
  });

  it('supports JSON configs', async () => {
    const configPath = path.join(testDir, 'tool.config.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ source: 'json', ok: true }),
      'utf8'
    );

    const loaded = await loadConfigModule(configPath);

    expect(loaded.exportName).toBe('default');
    expect(loaded.value).toEqual({
      source: 'json',
      ok: true,
    });
  });

  it('can preserve missing-default state for callers that require explicit default exports', async () => {
    const configPath = path.join(testDir, 'extfn.config.ts');
    fs.writeFileSync(
      configPath,
      `
      export const config = {
        source: 'named-only',
      };
      `,
      'utf8'
    );

    const loaded = await loadConfigModule(configPath, {
      fallbackToModule: false,
      resolveFunctions: false,
    });

    expect(loaded.exportName).toBeNull();
    expect(loaded.value).toBeUndefined();
    expect(loaded.module).toMatchObject({
      config: {
        source: 'named-only',
      },
    });
  });

  it('resolves function exports when requested by shared callers', async () => {
    const configPath = path.join(testDir, 'tool.config.js');
    fs.writeFileSync(
      configPath,
      `
      export default async function config() {
        return {
          source: 'function',
          count: 3,
        };
      }
      `,
      'utf8'
    );

    const loaded = await loadConfigModule(configPath);

    expect(loaded.value).toEqual({
      source: 'function',
      count: 3,
    });
  });

  it('throws for unsupported config file extensions', async () => {
    const configPath = path.join(testDir, 'tool.config.txt');

    await expect(loadConfigModule(configPath)).rejects.toThrow(
      'Unsupported config module extension: .txt'
    );
  });

  it('propagates missing-file errors for supported extensions', async () => {
    const configPath = path.join(testDir, 'missing.config.js');

    await expect(loadConfigModule(configPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
