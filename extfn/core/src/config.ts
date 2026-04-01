import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateContentScripts } from './content/contentScript.js';
import {
  ExtfnError,
  createExtfnError,
  isExtfnError,
} from './errors.js';
import type {
  BackgroundHandlerDefinition,
  BackgroundPortHandlerDefinition,
  BrowserTarget,
  ExtensionConfig,
  PageSurfaceConfig,
  ResolvedBackgroundConfig,
  ResolvedBackgroundHandler,
  ResolvedBackgroundPortHandler,
  ResolvedExtensionConfig,
  ResolvedPageSurface,
  TargetManifestSurface,
} from './types.js';
import { SUPPORTED_BROWSER_TARGETS } from './types.js';

const TARGET_CAPABILITIES: Record<
  BrowserTarget,
  {
    sidepanel: boolean;
  }
> = {
  'chromium-mv3': {
    sidepanel: true,
  },
  'firefox-mv3': {
    sidepanel: false,
  },
};

const CONFIG_MARKER = Symbol.for('superfunctions.extfn.config');
const BACKGROUND_HANDLER_MARKER = Symbol.for(
  'superfunctions.extfn.background-handler'
);
const BACKGROUND_PORT_HANDLER_MARKER = Symbol.for(
  'superfunctions.extfn.background-port-handler'
);

export interface ResolveExtensionConfigOptions {
  configPath: string;
  loadModule?: (modulePath: string) => Promise<Record<string, unknown>>;
}

export function defineExtension<TConfig extends ExtensionConfig>(
  config: TConfig
): TConfig {
  return markDefinition(config, CONFIG_MARKER);
}

export function defineBackgroundHandler<
  THandler extends BackgroundHandlerDefinition,
>(handler: THandler): THandler {
  return markDefinition(handler, BACKGROUND_HANDLER_MARKER);
}

export function defineBackgroundPortHandler<
  THandler extends BackgroundPortHandlerDefinition,
>(handler: THandler): THandler {
  return markDefinition(handler, BACKGROUND_PORT_HANDLER_MARKER);
}

export async function resolveExtensionConfig(
  config: ExtensionConfig,
  options: ResolveExtensionConfigOptions
): Promise<ResolvedExtensionConfig> {
  assertExtensionConfig(config);

  const configPath = path.resolve(options.configPath);
  const configDir = path.dirname(configPath);
  const targets = validateTargetList(config.targets, 'targets');
  const surfaces = await resolveSurfaces(config, configDir, targets);
  const contentScripts = await validateContentScripts(
    config.contentScripts,
    configDir,
    targets
  );
  const background = await resolveBackground(config, configDir, options);

  return {
    config,
    configPath,
    configDir,
    targets,
    surfaces,
    contentScripts,
    background,
    manifests: buildTargetManifests(targets, surfaces, background),
  };
}

function assertExtensionConfig(config: unknown): asserts config is ExtensionConfig {
  if (!isRecord(config)) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      'Extension config must be an object.'
    );
  }

  if (typeof config.name !== 'string' || config.name.trim() === '') {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      'Extension config must include a non-empty name.'
    );
  }

  if (typeof config.version !== 'string' || config.version.trim() === '') {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      'Extension config must include a non-empty version.'
    );
  }

  if (!isRecord(config.background)) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      'Extension config must include a background definition.'
    );
  }

  if (
    typeof config.background.serviceWorker !== 'string' ||
    config.background.serviceWorker.trim() === ''
  ) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      'background.serviceWorker must be a non-empty string.'
    );
  }
}

async function resolveSurfaces(
  config: ExtensionConfig,
  configDir: string,
  extensionTargets: readonly BrowserTarget[]
): Promise<ResolvedPageSurface[]> {
  const surfaces: ResolvedPageSurface[] = [];

  await maybeAddSurface(
    surfaces,
    'popup',
    config.popup,
    configDir,
    extensionTargets
  );
  await maybeAddSurface(
    surfaces,
    'options',
    config.options,
    configDir,
    extensionTargets
  );
  await maybeAddSurface(
    surfaces,
    'sidepanel',
    config.sidepanel,
    configDir,
    extensionTargets
  );

  return surfaces;
}

async function maybeAddSurface(
  surfaces: ResolvedPageSurface[],
  surface: ResolvedPageSurface['surface'],
  declaration: PageSurfaceConfig | undefined,
  configDir: string,
  extensionTargets: readonly BrowserTarget[]
): Promise<void> {
  if (!declaration) {
    return;
  }

  if (
    !isRecord(declaration) ||
    typeof declaration.entry !== 'string' ||
    declaration.entry.trim() === ''
  ) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      `${surface}.entry must be a non-empty string.`
    );
  }

  const targets = validateScopedTargets(
    declaration.targets,
    extensionTargets,
    `${surface}.targets`
  );

  if (surface === 'sidepanel') {
    const unsupportedTargets = targets.filter(
      (target) => !TARGET_CAPABILITIES[target].sidepanel
    );
    if (unsupportedTargets.length > 0) {
      throw createExtfnError(
        'E_TARGET_UNSUPPORTED',
        'sidepanel is not available for every configured target; scope the surface or remove unsupported targets.',
        {
          surface,
          unsupportedTargets,
        }
      );
    }
  }

  const resolvedEntry = resolvePathFromConfig(configDir, declaration.entry);
  await assertFileExists(
    resolvedEntry,
    createExtfnError(
      'E_ENTRY_NOT_FOUND',
      `Missing page entry: ${declaration.entry}`,
      {
        surface,
        entry: declaration.entry,
      }
    )
  );

  surfaces.push({
    surface,
    entry: declaration.entry,
    resolvedEntry,
    outputPath: path.basename(declaration.entry),
    title: declaration.title,
    targets,
  });
}

async function resolveBackground(
  config: ExtensionConfig,
  configDir: string,
  options: ResolveExtensionConfigOptions
): Promise<ResolvedBackgroundConfig> {
  const resolvedServiceWorker = resolvePathFromConfig(
    configDir,
    config.background.serviceWorker
  );

  await assertFileExists(
    resolvedServiceWorker,
    createExtfnError(
      'E_ENTRY_NOT_FOUND',
      `Missing background service worker entry: ${config.background.serviceWorker}`,
      {
        entry: config.background.serviceWorker,
      }
    )
  );

  const background: ResolvedBackgroundConfig = {
    serviceWorker: config.background.serviceWorker,
    resolvedServiceWorker,
    messageHandlers: [],
    portHandlers: [],
  };

  if (config.background.messageHandlersDir) {
    const resolvedMessageHandlersDir = resolvePathFromConfig(
      configDir,
      config.background.messageHandlersDir
    );
    await assertDirectoryExists(
      resolvedMessageHandlersDir,
      createExtfnError(
        'E_ENTRY_NOT_FOUND',
        `Missing background message handlers directory: ${config.background.messageHandlersDir}`,
        {
          entry: config.background.messageHandlersDir,
        }
      )
    );

    background.messageHandlersDir = config.background.messageHandlersDir;
    background.resolvedMessageHandlersDir = resolvedMessageHandlersDir;
    background.messageHandlers = await discoverBackgroundHandlersInDirectory(
      resolvedMessageHandlersDir,
      options.loadModule
    );
  }

  if (config.background.portHandlersDir) {
    const resolvedPortHandlersDir = resolvePathFromConfig(
      configDir,
      config.background.portHandlersDir
    );
    await assertDirectoryExists(
      resolvedPortHandlersDir,
      createExtfnError(
        'E_ENTRY_NOT_FOUND',
        `Missing background port handlers directory: ${config.background.portHandlersDir}`,
        {
          entry: config.background.portHandlersDir,
        }
      )
    );

    background.portHandlersDir = config.background.portHandlersDir;
    background.resolvedPortHandlersDir = resolvedPortHandlersDir;
    background.portHandlers = await discoverBackgroundPortHandlersInDirectory(
      resolvedPortHandlersDir,
      options.loadModule
    );
  }

  return background;
}

export async function discoverBackgroundHandlersInDirectory(
  directoryPath: string,
  loadModule: ResolveExtensionConfigOptions['loadModule']
): Promise<ResolvedBackgroundHandler[]> {
  const moduleLoader = loadModule ?? loadModuleWithImport;
  const files = await collectModuleFiles(directoryPath);
  const handlers: ResolvedBackgroundHandler[] = [];
  const seenRoutes = new Set<string>();

  for (const filePath of files) {
    const module = await moduleLoader(filePath);
    const handler = module.default;

    if (!isBackgroundHandlerDefinition(handler)) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        `Invalid background handler export: ${toRelativeDisplayPath(filePath)}`,
        {
          filePath,
        }
      );
    }

    const route = `${handler.namespace}/${handler.method}`;

    if (seenRoutes.has(route)) {
      throw createExtfnError(
        'E_MANIFEST_COLLISION',
        `Duplicate background handler route: ${route}`,
        {
          route,
          filePath,
        }
      );
    }

    seenRoutes.add(route);
    handlers.push({
      filePath,
      namespace: handler.namespace,
      method: handler.method,
      handle: handler.handle,
    });
  }

  return handlers;
}

export async function discoverBackgroundPortHandlersInDirectory(
  directoryPath: string,
  loadModule: ResolveExtensionConfigOptions['loadModule']
): Promise<ResolvedBackgroundPortHandler[]> {
  const moduleLoader = loadModule ?? loadModuleWithImport;
  const files = await collectModuleFiles(directoryPath);
  const handlers: ResolvedBackgroundPortHandler[] = [];
  const seenChannels = new Set<string>();

  for (const filePath of files) {
    const module = await moduleLoader(filePath);
    const handler = module.default;

    if (!isBackgroundPortHandlerDefinition(handler)) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        `Invalid background port handler export: ${toRelativeDisplayPath(filePath)}`,
        {
          filePath,
        }
      );
    }

    if (seenChannels.has(handler.channel)) {
      throw createExtfnError(
        'E_MANIFEST_COLLISION',
        `Duplicate background port channel: ${handler.channel}`,
        {
          channel: handler.channel,
          filePath,
        }
      );
    }

    seenChannels.add(handler.channel);
    handlers.push({
      filePath,
      channel: handler.channel,
      onConnect: handler.onConnect,
      onMessage: handler.onMessage,
      onDisconnect: handler.onDisconnect,
    });
  }

  return handlers;
}

function buildTargetManifests(
  targets: readonly BrowserTarget[],
  surfaces: readonly ResolvedPageSurface[],
  background: ResolvedBackgroundConfig
): Record<BrowserTarget, TargetManifestSurface> {
  return Object.fromEntries(
    targets.map((target) => {
      const manifest: TargetManifestSurface = {
        background: {
          service_worker: path.basename(background.serviceWorker),
          type: 'module',
        },
      };

      for (const surface of surfaces) {
        if (!surface.targets.includes(target)) {
          continue;
        }

        if (surface.surface === 'popup') {
          manifest.action = {
            default_popup: surface.outputPath,
          };
        } else if (surface.surface === 'options') {
          manifest.options_ui = {
            page: surface.outputPath,
            open_in_tab: true,
          };
        } else if (surface.surface === 'sidepanel') {
          manifest.side_panel = {
            default_path: surface.outputPath,
          };
        }
      }

      return [target, manifest];
    })
  ) as Record<BrowserTarget, TargetManifestSurface>;
}

function validateTargetList(
  input: readonly string[],
  fieldName: string
): readonly BrowserTarget[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      `${fieldName} must contain at least one target.`
    );
  }

  return dedupeTargets(
    input.map((target) => validateTarget(target))
  );
}

function validateScopedTargets(
  scopedTargets: readonly string[] | undefined,
  extensionTargets: readonly BrowserTarget[],
  fieldName: string
): readonly BrowserTarget[] {
  if (!scopedTargets) {
    return extensionTargets;
  }

  const targets = validateTargetList(scopedTargets, fieldName);

  for (const target of targets) {
    if (!extensionTargets.includes(target)) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        `${fieldName} contains target outside extension.targets: ${target}`
      );
    }
  }

  return targets;
}

function validateTarget(target: string): BrowserTarget {
  if (
    !SUPPORTED_BROWSER_TARGETS.includes(target as BrowserTarget)
  ) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      `Unsupported target: ${target}`,
      {
        target,
      }
    );
  }

  return target as BrowserTarget;
}

function dedupeTargets(targets: readonly BrowserTarget[]): readonly BrowserTarget[] {
  return [...new Set(targets)];
}

function isBackgroundHandlerDefinition(
  value: unknown
): value is BackgroundHandlerDefinition {
  return (
    isRecord(value) &&
    typeof value.namespace === 'string' &&
    value.namespace.trim() !== '' &&
    typeof value.method === 'string' &&
    value.method.trim() !== '' &&
    typeof value.handle === 'function'
  );
}

function isBackgroundPortHandlerDefinition(
  value: unknown
): value is BackgroundPortHandlerDefinition {
  return (
    isRecord(value) &&
    typeof value.channel === 'string' &&
    value.channel.trim() !== '' &&
    (value.onConnect === undefined || typeof value.onConnect === 'function') &&
    (value.onMessage === undefined || typeof value.onMessage === 'function') &&
    (value.onDisconnect === undefined || typeof value.onDisconnect === 'function')
  );
}

function resolvePathFromConfig(configDir: string, candidate: string): string {
  return path.resolve(configDir, candidate);
}

async function collectModuleFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, {
    withFileTypes: true,
  });
  const filePaths: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await collectModuleFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && isSupportedModuleFile(entry.name)) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function isSupportedModuleFile(fileName: string): boolean {
  if (fileName.endsWith('.d.ts')) {
    return false;
  }

  const extension = path.extname(fileName).toLowerCase();
  return (
    extension === '.ts' ||
    extension === '.js' ||
    extension === '.mjs' ||
    extension === '.cjs'
  );
}

async function assertFileExists(
  filePath: string,
  error: ExtfnError
): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw error;
    }
  } catch (caught) {
    if (isExtfnError(caught)) {
      throw caught;
    }

    throw error;
  }
}

async function assertDirectoryExists(
  directoryPath: string,
  error: ExtfnError
): Promise<void> {
  try {
    const stats = await fs.stat(directoryPath);
    if (!stats.isDirectory()) {
      throw error;
    }
  } catch (caught) {
    if (isExtfnError(caught)) {
      throw caught;
    }

    throw error;
  }
}

async function loadModuleWithImport(
  modulePath: string
): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(modulePath).href)) as Record<
    string,
    unknown
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function markDefinition<TValue extends object>(
  value: TValue,
  marker: symbol
): TValue {
  return Object.defineProperty(value, marker, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

function toRelativeDisplayPath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || path.basename(filePath);
}
