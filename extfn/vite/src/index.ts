export {
  buildManifest,
  createTargetBuildOutputs,
  type TargetBuildOutputs,
} from './manifest/buildManifest.js';
export { mergeManifest } from './manifest/mergeManifest.js';
export {
  extfnVite,
  prepareResolvedExtensionConfig,
  type ExtfnViteOptions,
} from './plugin.js';
export {
  decideReloadStrategy,
  detectChangedSurface,
  formatReloadDecisionLog,
  assertSafeReloadDecision,
  type ExtfnReloadDecision,
  type ExtfnReloadPolicyOptions,
  type ExtfnReloadStrategy,
} from './dev/reloadPolicy.js';
export {
  ensureTargetOutputDirectories,
  getTargetOutputDir,
  getTargetOutputDirName,
  writeTargetFile,
  type ExtfnOutputMode,
} from './dev/devOutputs.js';
export { applyChromiumTargetManifest } from './targets/chromium.js';
export { applyFirefoxTargetManifest } from './targets/firefox.js';
export { loadExtensionConfig, type LoadedExtensionConfig } from './loadExtensionConfig.js';
export { discoverBackgroundHandlers } from './discovery/backgroundHandlers.js';
export { discoverBackgroundPorts } from './discovery/backgroundPorts.js';
