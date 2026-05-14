import fs from 'node:fs/promises';
import path from 'node:path';

import { loadConfigModule } from '@superfunctions/cli';
import {
  ExtfnError,
  resolveExtensionConfig,
  type ExtensionConfig,
  type ResolvedExtensionConfig,
} from '@extfn/core';

const EXTENSION_CONFIG_CANDIDATES = [
  'extfn.config.ts',
  'extfn.config.js',
  'extfn.config.mjs',
  'extfn.config.cjs',
  'extfn.config.json',
] as const;

export interface LoadedExtensionConfig {
  config: ExtensionConfig;
  configPath: string;
  resolvedConfig: ResolvedExtensionConfig;
}

export async function loadExtensionConfig(
  configFile?: string
): Promise<LoadedExtensionConfig> {
  const configPath = await resolveConfigPath(configFile);
  const loaded = await loadConfigModule(configPath, {
    fallbackToModule: false,
    resolveFunctions: false,
  });

  if (loaded.exportName !== 'default') {
    throw new ExtfnError(
      'E_CONFIG_INVALID',
      'Extension config file must default-export defineExtension(...).',
      {
        details: {
          configPath,
        },
      }
    );
  }

  if (!isRecord(loaded.value)) {
    throw new ExtfnError(
      'E_CONFIG_INVALID',
      'Extension config file must default-export an object returned by defineExtension(...).',
      {
        details: {
          configPath,
        },
      }
    );
  }

  const resolvedConfig = await resolveExtensionConfig(
    loaded.value as unknown as ExtensionConfig,
    {
      configPath,
      loadModule: async (modulePath) =>
        (
          await loadConfigModule(modulePath, {
            resolveFunctions: false,
          })
        ).module,
    }
  );

  return {
    config: loaded.value as unknown as ExtensionConfig,
    configPath,
    resolvedConfig,
  };
}

async function resolveConfigPath(configFile?: string): Promise<string> {
  if (configFile) {
    const resolvedPath = path.resolve(configFile);
    await assertPathExists(
      resolvedPath,
      new ExtfnError(
        'E_ENTRY_NOT_FOUND',
        `Missing extension config: ${configFile}`,
        {
          details: {
            configFile,
          },
        }
      )
    );
    return resolvedPath;
  }

  for (const candidate of EXTENSION_CONFIG_CANDIDATES) {
    const resolvedCandidate = path.resolve(candidate);

    try {
      await fs.access(resolvedCandidate);
      return resolvedCandidate;
    } catch {
      continue;
    }
  }

  throw new ExtfnError(
    'E_ENTRY_NOT_FOUND',
    'Missing extension config: extfn.config.ts',
    {
      details: {
        candidates: EXTENSION_CONFIG_CANDIDATES,
      },
    }
  );
}

async function assertPathExists(
  candidatePath: string,
  error: ExtfnError
): Promise<void> {
  try {
    await fs.access(candidatePath);
  } catch {
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
