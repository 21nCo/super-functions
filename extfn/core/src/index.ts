export {
  defineContentScript,
  validateContentScriptShape,
  validateContentScripts,
} from './content/contentScript.js';
export {
  createAnchorKey,
  resolveAnchors,
  type AnchorContext,
  type ResolvedAnchorMount,
} from './content/anchors.js';
export {
  MountRegistry,
  type MountedContentRoot,
} from './content/mountRegistry.js';
export {
  createMountRootId,
  ensureStyles,
  mountContentScript,
  type MountContentScriptOptions,
} from './content/reinject.js';
export {
  discoverBackgroundHandlersInDirectory,
  discoverBackgroundPortHandlersInDirectory,
  defineBackgroundHandler,
  defineBackgroundPortHandler,
  defineExtension,
  resolveExtensionConfig,
  type ResolveExtensionConfigOptions,
} from './config.js';
export {
  ExtfnError,
  createExtfnError,
  isExtfnError,
  type ExtfnErrorCode,
  type ExtfnErrorDetails,
} from './errors.js';
export {
  createBrowserFacade,
  type CreateBrowserFacadeOptions,
} from './runtime/browser.js';
export {
  assertPayloadWithinLimit,
  assertSupportedBrowserMethodPath,
  assertValidCapabilityMap,
  getBrowserCapabilities,
  MAX_RUNTIME_PAYLOAD_BYTES,
  mergeManifestPermissions,
  type MergedPermissionSets,
  type PermissionMergeInput,
  type PermissionSets,
} from './runtime/capabilities.js';
export {
  detectBrowserTarget,
  resolveRuntimeAddress,
  type RuntimeContextMetadata,
  type RuntimeDetectionGlobals,
} from './runtime/context.js';
export {
  createErrorResponseEnvelope,
  createEventEnvelope,
  createPortCloseEnvelope,
  createPortEnvelope,
  createRequestEnvelope,
  createSuccessResponseEnvelope,
  assertValidEventEnvelope,
  assertValidPortCloseEnvelope,
  assertValidPortEnvelope,
  assertValidRequestEnvelope,
  assertValidResponseEnvelope,
  type PortCloseReason,
  type RuntimeEventEnvelope,
  type RuntimePortCloseEnvelope,
  type RuntimePortEnvelope,
  type RuntimeRequestEnvelope,
  type RuntimeResponseEnvelope,
} from './runtime/envelope.js';
export {
  createEventBus,
  type CreateEventBusOptions,
  type EventBus,
} from './runtime/events.js';
export {
  createHandlerNotFoundError,
  createRuntimeProtocolError,
  createTimeoutError,
} from './runtime/errors.js';
export {
  createRuntime,
  getRuntime,
  type CreateRuntimeOptions,
  type ExtfnRuntime,
} from './runtime/getRuntime.js';
export {
  createPortBroker,
  type CreatePortBrokerOptions,
  type PortClient,
  type RuntimePort,
} from './runtime/ports.js';
export {
  createRpcClient,
  mergePluginContributions,
  resolvePluginOrder,
  type CreateRpcClientOptions,
  type RegisteredRequestHandler,
  type RpcClient,
  type RuntimePlugin,
} from './runtime/router.js';
export type {
  AnchorStrategy,
  BackgroundConfig,
  BackgroundHandlerDefinition,
  BackgroundPortHandlerDefinition,
  BrowserCapabilities,
  BrowserFacade,
  BrowserTarget,
  ContentScriptConfig,
  ContentMountMode,
  ExtensionConfig,
  ManifestOverride,
  PageSurfaceConfig,
  ResolvedBackgroundConfig,
  ResolvedBackgroundHandler,
  ResolvedBackgroundPortHandler,
  ResolvedContentScriptConfig,
  ResolvedExtensionConfig,
  ResolvedPageSurface,
  ResolverAnchorStrategy,
  RuntimeAddress,
  RuntimeContextKind,
  SelectorAnchorStrategy,
  SelectorListAnchorStrategy,
  TargetManifestSurface,
} from './types.js';
export { SUPPORTED_BROWSER_TARGETS } from './types.js';
