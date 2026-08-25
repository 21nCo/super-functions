export { DevFnConfigError, type ConfigErrorCode } from "./errors.js";
export { discoverProject, renderDevFnConfig } from "./discovery.js";
export { DEVFN_CONFIG_CANDIDATES, findDevFnRoot, loadDevFnConfig, loadDevFnPolicy, loadTrustedDevFnConfig, resolveDevFnManifestPath } from "./load.js";
export { resolveContainedPath } from "./paths.js";
export { matchesProcessIdentity, processBirthSignature, processExists } from "./process-identity.js";
export { validateDevFnConfig, validateDevFnPolicy } from "./schema.js";
export { configDigest, defaultStateDir, isProjectTrusted, readTrustedManifest, trustProject } from "./trust.js";
export type * from "./types.js";

export function defineDevFnConfig<T extends import("./types.js").DevFnConfig>(config: T): T { return config; }
export function defineDevFnPolicy<T extends import("./types.js").DevFnPolicy>(policy: T): T { return policy; }
