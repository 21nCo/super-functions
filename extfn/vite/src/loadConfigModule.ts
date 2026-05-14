import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface LoadConfigModuleOptions {
  fallbackToModule?: boolean;
  resolveFunctions?: boolean;
}

export interface LoadedConfigModule {
  path: string;
  module: Record<string, unknown>;
  exportName: string | null;
  value: unknown;
}

const SUPPORTED_CONFIG_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
]);

const require = createRequire(import.meta.url);

export async function loadConfigModule(
  configPath: string,
  options: LoadConfigModuleOptions = {}
): Promise<LoadedConfigModule> {
  const resolvedPath = path.resolve(configPath);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!SUPPORTED_CONFIG_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported config module extension: ${extension || '(none)'}`
    );
  }

  await fs.access(resolvedPath);

  const module = await importConfigModule(resolvedPath, extension);
  const selection = selectExport(module, options);
  let value = selection.value;

  if (options.resolveFunctions !== false && typeof value === 'function') {
    value = await Promise.resolve((value as () => unknown | Promise<unknown>)());
  }

  return {
    path: resolvedPath,
    module,
    exportName: selection.exportName,
    value,
  };
}

async function importConfigModule(
  resolvedPath: string,
  extension: string
): Promise<Record<string, unknown>> {
  if (extension === '.json') {
    const raw = await fs.readFile(resolvedPath, 'utf8');
    return { default: JSON.parse(raw) as unknown };
  }

  if (extension === '.ts') {
    const createJiti = require('jiti') as (
      id?: string,
      options?: {
        interopDefault?: boolean;
        extensions?: string[];
      }
    ) => (id: string) => unknown;
    const loader = createJiti(path.dirname(resolvedPath), {
      interopDefault: false,
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    });

    return (await Promise.resolve(loader(resolvedPath))) as Record<string, unknown>;
  }

  return (await import(pathToFileURL(resolvedPath).href)) as Record<
    string,
    unknown
  >;
}

function selectExport(
  module: Record<string, unknown>,
  options: LoadConfigModuleOptions
): { exportName: string | null; value: unknown } {
  if ('default' in module) {
    return {
      exportName: 'default',
      value: module.default,
    };
  }

  if (options.fallbackToModule !== false) {
    return {
      exportName: null,
      value: module,
    };
  }

  return {
    exportName: null,
    value: undefined,
  };
}
