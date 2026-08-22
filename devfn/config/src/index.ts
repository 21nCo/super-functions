export { DevFnConfigError, type ConfigErrorCode } from "./errors.js";
export { discoverProject, renderDevFnConfig } from "./discovery.js";
export { DEVFN_CONFIG_CANDIDATES, findDevFnRoot, loadDevFnConfig, loadDevFnPolicy, resolveDevFnManifestPath } from "./load.js";
export { validateDevFnConfig, validateDevFnPolicy } from "./schema.js";
export { configDigest, defaultStateDir, isProjectTrusted, trustProject } from "./trust.js";
export type * from "./types.js";

export function defineDevFnConfig<T>(config: T): T { return config; }
export function defineDevFnPolicy<T>(policy: T): T { return policy; }
