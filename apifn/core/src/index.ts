// @apifn/core — public API

// Types
export type {
  // HTTP
  HttpMethod,
  SchemaInput,
  JsonSchema,

  // Route Introspection
  IntrospectOptions,
  IntrospectedRoute,
  ParameterDescriptor,
  RequestBodyDescriptor,
  ResponseDescriptor,
  SecurityRequirement,

  // Schema Descriptors
  SchemaDescriptor,
  SchemaDescriptorResponse,

  // OpenAPI Document Types
  OpenAPIDocument,
  OpenAPIInfoObject,
  OpenAPIGenerateOptions,
  ServerObject,
  ExternalDocsObject,
  TagObject,
  PathsObject,
  PathItemObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  MediaTypeObject,
  SchemaObject,
  ComponentsObject,
  SecuritySchemeObject,
  OAuthFlowsObject,
  OAuthFlowObject,
  HeaderObject,
  LinkObject,
  ExampleObject,
  ReferenceObject,
  EncodingObject,

  // Diff
  DiffResult,
  DiffEntry,

  // Validation
  ValidationError,

  // Auth
  AuthConfig,

  // Integrations
  EndpointMetrics,
  WatchFnClient,
  RateLimitInfo,

  // Snippets
  SnippetTarget,
  SnippetOptions,

  // Mock
  MockServerOptions,
  CorsOptions,

  // Re-exports from @superfunctions/http
  Router,
  Route,
  Middleware,
} from "./types.js";

export { introspectRouter } from "./introspect.js";
export { apiSchema } from "./api-schema.js";
export { detectSchemaType } from "./schema/detect.js";
export { convertZodSchema } from "./schema/zod.js";
export { convertTypeBoxSchema } from "./schema/typebox.js";
export { convertSchema } from "./schema/convert.js";
export { deduplicateSchemas } from "./schema/dedup.js";
export type { SchemaType } from "./schema/detect.js";
export type { DeduplicateSchemaInput, DeduplicateSchemasResult } from "./schema/dedup.js";
export { generateOpenAPI } from "./openapi/generate.js";
export { fromRouter } from "./openapi/from-router.js";
export type { FromRouterOptions } from "./openapi/from-router.js";
export { parseOpenAPI } from "./openapi/parse.js";
export { validateOpenAPI } from "./openapi/validate.js";
export { upconvertFrom3_0 } from "./openapi/upconvert.js";
export { diffOpenAPI } from "./diff/diff.js";
export { formatDiffAsJson, formatDiffAsText } from "./diff/format.js";
export type { DiffReportJson } from "./diff/format.js";
export {
  fetchEndpointMetrics,
  createWatchFnClient,
  apifnWatchMiddleware,
} from "./integrations/watchfn.js";
export type {
  FetchEndpointMetricsOptions,
  CreateWatchFnClientOptions,
  WatchFnMiddlewareOptions,
} from "./integrations/watchfn.js";
export {
  mintTestToken,
  createAuthfnCollectionMiddleware,
} from "./integrations/authfn.js";
export type {
  MintTestTokenOptions,
  MintTestTokenResponse,
} from "./integrations/authfn.js";
export { fetchRateLimits } from "./integrations/secfn.js";
export { logfnReporter, createCliLogger } from "./integrations/logfn.js";
export { ApifnTestAdapter } from "./integrations/testfn.js";
export type { CliLoggerOptions } from "./integrations/logfn.js";
