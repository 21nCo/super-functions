// Re-export types from types.ts
export type {
  DatafnSchema,
  DatafnResourceSchema,
  DatafnFieldSchema,
  DatafnRelationSchema,
  DatafnPermissionsPolicy,
  RelationSimpleCapability,
  DatafnEvent,
  DatafnEventFilter,
  DatafnSignal,
  DatafnHookContext,
  DatafnPlugin,
  DatafnLogger,
  DatafnLimitsConfig,
  DatafnWsConfig,
} from "./types.js";

// Re-export defineSchema helper
export { defineSchema } from "./types.js";

// Re-export capability types and helpers
export type {
  SimpleCapability,
  AccessLevel,
  ShareableCapability,
  CapabilityEntry,
  SchemaCapabilities,
  ResourceCapabilities,
} from "./capabilities.js";
export {
  CAPABILITY_FIELD_DEFS,
  resolveCapabilities,
  getCapabilityFields,
  RELATION_CAPABILITY_FIELD_DEFS,
  getRelationCapabilityFieldNames,
} from "./capabilities.js";

// Re-export error types and helpers
export type { DatafnErrorCode, DatafnError, DatafnEnvelope } from "./errors.js";
export { ok, err } from "./errors.js";

// Re-export schema validation
export { validateSchema, isNamespaced, resolveRelationCapabilities } from "./schema.js";

// Re-export namespace helper
export { ns } from "./ns.js";

// Re-export DFQL normalization
export { normalizeDfql, dfqlKey } from "./normalize.js";

// Re-export envelope utilities
export { unwrapEnvelope } from "./envelope.js";

export * from "./dfql.js";

// Re-export KV utilities
export { ensureBuiltinKv, kvId, KV_RESOURCE_NAME } from "./kv.js";

// Re-export join store utilities
export { getJoinStoreKey, getJoinTableName, enumerateJoinStoreKeys } from "./joins.js";

// Re-export schema index utilities
export {
  type SchemaIndex,
  buildSchemaIndex,
  getResource,
  getField,
  getRelationsFrom,
  getRelation,
  getRelationTarget,
  findRelationBidirectional,
} from "./schema-index.js";

// Re-export filter evaluation + operator normalization
export {
  type FilterEvalOptions,
  evaluateFilter,
  OP_REMAP,
  normalizeFilterOps,
} from "./filters.js";

// Re-export relation payload normalization
export {
  type NormalizedRelation,
  normalizeRelationPayload,
} from "./relations.js";

// Re-export aggregation utilities
export { calculateAggregation } from "./aggregate.js";

// Re-export sort utilities
export { type SortTerm, parseSortTerms, sortRecords } from "./sort.js";

// Re-export select token parsing
export { type SelectToken, parseSelectToken } from "./select.js";

// Re-export date conversion utilities
export {
  toEpochMs,
  fromEpochMs,
  coerceDateFieldsToEpoch,
  parseDateFieldsToDate,
} from "./date.js";

// Re-export validation primitives
export { checkPrototypePollution, validateFieldValue } from "./validate.js";

// Re-export plugin hook runner
export {
  type HookError,
  type BeforeHookResult,
  runBeforeHook,
  runAfterHook,
} from "./hooks.js";

// Re-export search provider interface
export type { SearchProvider } from "./search-provider.js";
