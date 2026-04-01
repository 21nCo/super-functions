export const SUPPORTED_BROWSER_TARGETS = [
  'chromium-mv3',
  'firefox-mv3',
] as const;

export type BrowserTarget = (typeof SUPPORTED_BROWSER_TARGETS)[number];

export type RuntimeContextKind =
  | 'background'
  | 'popup'
  | 'options'
  | 'sidepanel'
  | 'content';

export interface BrowserCapabilities {
  target: BrowserTarget;
  sidepanel: boolean;
  offscreen: boolean;
  scripting: boolean;
}

export interface RuntimeAddress {
  context: RuntimeContextKind;
  surfaceId?: string;
  contentScriptId?: string;
  tabId?: number;
  frameId?: number;
}

export interface BrowserFacade {
  raw: unknown;
  capabilities: BrowserCapabilities;
  call<T = unknown>(path: string, ...args: unknown[]): Promise<T>;
  namespace<T extends object = Record<string, unknown>>(path: string): T;
}

export interface ManifestOverride {
  readonly [key: string]: unknown;
}

export interface PageSurfaceConfig {
  entry: string;
  title?: string;
  targets?: readonly BrowserTarget[];
  manifest?: ManifestOverride;
}

export interface ContentScriptConfig {
  id: string;
  entry: string;
  matches: readonly string[];
  excludeMatches?: readonly string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  allFrames?: boolean;
  world?: 'ISOLATED' | 'MAIN';
  anchors?: readonly AnchorStrategy[];
  css?: readonly string[];
  styleIsolation?: 'inherit' | 'root-scoped' | 'shadow-root';
  normalizeRootStyles?: boolean;
  jsWorld?: 'isolated' | 'main';
  targets?: readonly BrowserTarget[];
}

export type ContentMountMode = 'append' | 'prepend' | 'replace' | 'shadow';

export interface SelectorAnchorStrategy {
  kind: 'selector';
  selector: string;
  mountMode: ContentMountMode;
}

export interface SelectorListAnchorStrategy {
  kind: 'selector-list';
  selector: string;
  mountMode: ContentMountMode;
}

export interface ResolverAnchorStrategy {
  kind: 'resolver';
  exportName: string;
  mountMode: ContentMountMode;
}

export type AnchorStrategy =
  | SelectorAnchorStrategy
  | SelectorListAnchorStrategy
  | ResolverAnchorStrategy;

export interface BackgroundConfig {
  serviceWorker: string;
  messageHandlersDir?: string;
  portHandlersDir?: string;
}

export interface ExtensionConfig {
  name: string;
  version: string;
  description?: string;
  targets: readonly BrowserTarget[];
  background: BackgroundConfig;
  popup?: PageSurfaceConfig;
  options?: PageSurfaceConfig;
  sidepanel?: PageSurfaceConfig;
  contentScripts?: readonly ContentScriptConfig[];
  manifest?: ManifestOverride;
  plugins?: readonly {
    id: string;
    dependsOn?: readonly string[];
  }[];
}

export interface BackgroundHandlerDefinition<
  Payload = unknown,
  Result = unknown,
> {
  namespace: string;
  method: string;
  handle: (...args: unknown[]) => Result | Promise<Result>;
  payload?: Payload;
}

export interface BackgroundPortHandlerDefinition<
  Inbound = unknown,
  Outbound = Inbound,
> {
  channel: string;
  onConnect?: (...args: unknown[]) => unknown | Promise<unknown>;
  onMessage?: (...args: unknown[]) => Outbound | Promise<Outbound>;
  onDisconnect?: (...args: unknown[]) => unknown | Promise<unknown>;
  inbound?: Inbound;
}

export interface ResolvedPageSurface {
  surface: 'popup' | 'options' | 'sidepanel';
  entry: string;
  resolvedEntry: string;
  outputPath: string;
  title?: string;
  targets: readonly BrowserTarget[];
}

export interface ResolvedContentScriptConfig extends ContentScriptConfig {
  resolvedEntry: string;
  resolvedCss: readonly string[];
}

export interface ResolvedBackgroundHandler {
  filePath: string;
  namespace: string;
  method: string;
  handle: BackgroundHandlerDefinition['handle'];
}

export interface ResolvedBackgroundPortHandler {
  filePath: string;
  channel: string;
  onConnect?: BackgroundPortHandlerDefinition['onMessage'];
  onMessage?: BackgroundPortHandlerDefinition['onMessage'];
  onDisconnect?: BackgroundPortHandlerDefinition['onMessage'];
}

export interface ResolvedBackgroundConfig {
  serviceWorker: string;
  resolvedServiceWorker: string;
  messageHandlersDir?: string;
  resolvedMessageHandlersDir?: string;
  portHandlersDir?: string;
  resolvedPortHandlersDir?: string;
  messageHandlers: readonly ResolvedBackgroundHandler[];
  portHandlers: readonly ResolvedBackgroundPortHandler[];
}

export interface TargetManifestSurface {
  action?: {
    default_popup: string;
  };
  options_ui?: {
    page: string;
    open_in_tab: true;
  };
  side_panel?: {
    default_path: string;
  };
  background: {
    service_worker: string;
    type: 'module';
  };
}

export interface ResolvedExtensionConfig {
  config: ExtensionConfig;
  configPath: string;
  configDir: string;
  targets: readonly BrowserTarget[];
  surfaces: readonly ResolvedPageSurface[];
  contentScripts: readonly ResolvedContentScriptConfig[];
  background: ResolvedBackgroundConfig;
  manifests: Record<BrowserTarget, TargetManifestSurface>;
}
