import type { BrowserTarget } from '../types.js';
import { createBrowserFacade, type BrowserFacade } from './browser.js';
import {
  getBrowserCapabilities,
  mergeManifestPermissions,
  type BrowserCapabilities,
  type MergedPermissionSets,
  type PermissionMergeInput,
} from './capabilities.js';
import { createEventBus, type EventBus } from './events.js';
import { createPortBroker, type PortClient } from './ports.js';
import {
  createRpcClient,
  type RpcClient,
  type RuntimePlugin,
} from './router.js';
import {
  detectBrowserTarget,
  resolveRuntimeAddress,
  type RuntimeAddress,
  type RuntimeDetectionGlobals,
} from './context.js';

export interface ExtfnRuntime {
  address: RuntimeAddress;
  browser: BrowserFacade;
  capabilities: BrowserCapabilities;
  permissions: MergedPermissionSets;
  rpc: RpcClient;
  events: EventBus;
  ports: PortClient;
}

export interface CreateRuntimeOptions {
  globals?: RuntimeDetectionGlobals;
  target?: BrowserTarget;
  rawBrowser?: unknown;
  permissions?: PermissionMergeInput;
  requestHandlers?: readonly {
    namespace: string;
    method: string;
    handle: (...args: unknown[]) => unknown | Promise<unknown>;
  }[];
  portHandlers?: readonly {
    channel: string;
    onConnect?: (...args: unknown[]) => unknown | Promise<unknown>;
    onMessage?: (...args: unknown[]) => unknown | Promise<unknown>;
    onDisconnect?: (...args: unknown[]) => unknown | Promise<unknown>;
  }[];
  plugins?: readonly RuntimePlugin[];
  onEventError?: (error: unknown) => void;
  onPortStateChange?: (portId: string, state: 'opening' | 'open' | 'reconnecting' | 'closed') => void;
}

export function getRuntime(): ExtfnRuntime {
  return createRuntime();
}

export function createRuntime(
  options: CreateRuntimeOptions = {}
): ExtfnRuntime {
  const globals = options.globals ?? (globalThis as RuntimeDetectionGlobals);
  const target = options.target ?? detectBrowserTarget(globals);
  const rawBrowser = options.rawBrowser ?? globals.browser ?? globals.chrome ?? {};
  const capabilities = getBrowserCapabilities(target);
  const address = resolveRuntimeAddress(globals);
  let runtime!: ExtfnRuntime;
  const events = createEventBus({
    source: address,
    onError: options.onEventError,
  });
  const rpc = createRpcClient({
    address,
    runtimeProvider: () => runtime,
    handlers: options.requestHandlers,
    plugins: options.plugins,
  });
  const ports = createPortBroker({
    address,
    runtimeProvider: () => runtime,
    handlers: options.portHandlers,
    onStateChange: options.onPortStateChange,
  }).client;

  runtime = {
    address,
    browser: createBrowserFacade({
      raw: rawBrowser,
      target,
    }),
    capabilities,
    permissions: mergeManifestPermissions(options.permissions ?? {}),
    rpc,
    events,
    ports,
  };

  return runtime;
}
