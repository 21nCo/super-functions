import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface LoadConfigModuleOptions<TValue = unknown> {
  exportNames?: readonly string[];
  exportPriority?: 'default-first' | 'named-first';
  fallbackToModule?: boolean;
  resolveFunctions?: boolean;
  transform?: (
    value: unknown,
    context: LoadedConfigModuleContext
  ) => Promise<TValue> | TValue;
}

export interface LoadedConfigModuleContext {
  path: string;
  module: Record<string, unknown>;
  exportName: string | null;
}

export interface LoadedConfigModule<TValue = unknown>
  extends LoadedConfigModuleContext {
  value: TValue;
}

const SUPPORTED_CONFIG_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
]);

export async function loadConfigModule<TValue = unknown>(
  configPath: string,
  options: LoadConfigModuleOptions<TValue> = {}
): Promise<LoadedConfigModule<TValue>> {
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
  const value = await transformSelectedValue(
    selection.value,
    {
      path: resolvedPath,
      module,
      exportName: selection.exportName,
    },
    options
  );

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
    const jitiImport = await import('jiti');
    const createJiti = jitiImport.default || jitiImport;
    const loader = createJiti(path.dirname(resolvedPath), {
      interopDefault: false,
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    });

    return (await Promise.resolve(
      loader(resolvedPath)
    )) as Record<string, unknown>;
  }

  return (await import(pathToFileURL(resolvedPath).href)) as Record<
    string,
    unknown
  >;
}

function selectExport(
  module: Record<string, unknown>,
  options: LoadConfigModuleOptions<unknown>
): { exportName: string | null; value: unknown } {
  const exportNames = options.exportNames ?? [];
  const exportPriority = options.exportPriority ?? 'default-first';

  const selectNamedExport = (): { exportName: string | null; value: unknown } | null => {
    for (const exportName of exportNames) {
      if (exportName in module) {
        return {
          exportName,
          value: module[exportName],
        };
      }
    }

    return null;
  };

  const selectDefaultExport = (): { exportName: string | null; value: unknown } | null => {
    if ('default' in module) {
      return {
        exportName: 'default',
        value: module.default,
      };
    }

    return null;
  };

  const preferred = exportPriority === 'named-first' ? selectNamedExport() : selectDefaultExport();
  if (preferred) {
    return preferred;
  }

  const secondary = exportPriority === 'named-first' ? selectDefaultExport() : selectNamedExport();
  if (secondary) {
    return secondary;
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

async function transformSelectedValue<TValue>(
  value: unknown,
  context: LoadedConfigModuleContext,
  options: LoadConfigModuleOptions<TValue>
): Promise<TValue> {
  let resolvedValue = value;

  if (options.resolveFunctions !== false && typeof resolvedValue === 'function') {
    resolvedValue = await Promise.resolve(
      (resolvedValue as () => unknown | Promise<unknown>)()
    );
  }

  if (options.transform) {
    return await options.transform(resolvedValue, context);
  }

  return resolvedValue as TValue;
}
