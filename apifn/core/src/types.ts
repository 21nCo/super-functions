/**
 * @apifn/core — Core types and interfaces
 *
 * All shared types for route introspection, schema descriptors,
 * OpenAPI generation, diff detection, and ecosystem integrations.
 */

import type { Router, Route, Middleware } from "@superfunctions/http";

// Re-export for convenience
export type { Router, Route, Middleware };

// ============================================================================
// HTTP Method
// ============================================================================

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

// ============================================================================
// Schema Type Aliases
// ============================================================================

/** Represents any schema type: zod, TypeBox, or plain JSON Schema */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaInput = any;

/** JSON Schema object */
export type JsonSchema = Record<string, unknown>;

// ============================================================================
// Route Introspection
// ============================================================================

export interface IntrospectOptions {
  /** Include routes matching these path prefixes only */
  include?: string[];
  /** Exclude routes matching these path prefixes */
  exclude?: string[];
  /** Base path to prepend to all route paths */
  basePath?: string;
}

export interface ParameterDescriptor {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  deprecated?: boolean;
  schema: JsonSchema;
}

export interface RequestBodyDescriptor {
  required?: boolean;
  description?: string;
  content: Record<
    string,
    {
      schema: JsonSchema;
      examples?: Record<string, unknown>;
    }
  >;
}

export interface ResponseDescriptor {
  description: string;
  content?: Record<
    string,
    {
      schema: JsonSchema;
      examples?: Record<string, unknown>;
    }
  >;
  headers?: Record<string, { schema: JsonSchema; description?: string }>;
}

export type SecurityRequirement = Record<string, string[]>;

export interface IntrospectedRoute {
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters: ParameterDescriptor[];
  requestBody?: RequestBodyDescriptor;
  responses: Record<string, ResponseDescriptor>;
  security?: SecurityRequirement[];
  meta: Record<string, unknown>;
}

// ============================================================================
// Schema Descriptors
// ============================================================================

export interface SchemaDescriptorResponse {
  description: string;
  schema?: SchemaInput;
  headers?: Record<string, SchemaInput>;
}

export interface SchemaDescriptor {
  /** Human-readable summary */
  summary?: string;
  /** Detailed description */
  description?: string;
  /** Unique operation identifier */
  operationId?: string;
  /** Tags for grouping */
  tags?: string[];
  /** Whether this endpoint is deprecated */
  deprecated?: boolean;
  /** Request body schema (zod, TypeBox, or JSON Schema) */
  body?: SchemaInput;
  /** Query parameter schemas */
  query?: Record<string, SchemaInput>;
  /** Path parameter schemas */
  params?: Record<string, SchemaInput>;
  /** Header parameter schemas */
  headers?: Record<string, SchemaInput>;
  /** Response schemas keyed by status code */
  responses?: Record<string | number, SchemaDescriptorResponse>;
  /** Security requirements */
  security?: SecurityRequirement[];
}

// ============================================================================
// OpenAPI Types
// ============================================================================

export interface OpenAPIInfoObject {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string; identifier?: string };
  summary?: string;
}

export interface ServerObject {
  url: string;
  description?: string;
  variables?: Record<
    string,
    {
      default: string;
      enum?: string[];
      description?: string;
    }
  >;
}

export interface ExternalDocsObject {
  url: string;
  description?: string;
}

export interface TagObject {
  name: string;
  description?: string;
  externalDocs?: ExternalDocsObject;
}

export interface SchemaObject extends JsonSchema {
  [key: string]: unknown;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject | ReferenceObject>;
  encoding?: Record<string, EncodingObject>;
}

export interface ExampleObject {
  summary?: string;
  description?: string;
  value?: unknown;
  externalValue?: string;
}

export interface ReferenceObject {
  $ref: string;
  summary?: string;
  description?: string;
}

export interface EncodingObject {
  contentType?: string;
  headers?: Record<string, HeaderObject | ReferenceObject>;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
}

export interface HeaderObject {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: SchemaObject;
}

export interface ParameterObject {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject | ReferenceObject>;
  content?: Record<string, MediaTypeObject>;
}

export interface RequestBodyObject {
  description?: string;
  content: Record<string, MediaTypeObject>;
  required?: boolean;
}

export interface ResponseObject {
  description: string;
  headers?: Record<string, HeaderObject | ReferenceObject>;
  content?: Record<string, MediaTypeObject>;
  links?: Record<string, LinkObject | ReferenceObject>;
}

export interface LinkObject {
  operationRef?: string;
  operationId?: string;
  parameters?: Record<string, unknown>;
  requestBody?: unknown;
  description?: string;
  server?: ServerObject;
}

export interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  externalDocs?: ExternalDocsObject;
  operationId?: string;
  parameters?: Array<ParameterObject | ReferenceObject>;
  requestBody?: RequestBodyObject | ReferenceObject;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  callbacks?: Record<
    string,
    Record<string, PathItemObject> | ReferenceObject
  >;
  deprecated?: boolean;
  security?: SecurityRequirement[];
  servers?: ServerObject[];
}

export interface PathItemObject {
  summary?: string;
  description?: string;
  get?: OperationObject;
  put?: OperationObject;
  post?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  patch?: OperationObject;
  trace?: OperationObject;
  servers?: ServerObject[];
  parameters?: Array<ParameterObject | ReferenceObject>;
}

export type PathsObject = Record<string, PathItemObject>;

export interface SecuritySchemeObject {
  type: "apiKey" | "http" | "mutualTLS" | "oauth2" | "openIdConnect";
  description?: string;
  name?: string;
  in?: "query" | "header" | "cookie";
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlowsObject;
  openIdConnectUrl?: string;
}

export interface OAuthFlowsObject {
  implicit?: OAuthFlowObject;
  password?: OAuthFlowObject;
  clientCredentials?: OAuthFlowObject;
  authorizationCode?: OAuthFlowObject;
}

export interface OAuthFlowObject {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface ComponentsObject {
  schemas?: Record<string, SchemaObject | ReferenceObject>;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  parameters?: Record<string, ParameterObject | ReferenceObject>;
  examples?: Record<string, ExampleObject | ReferenceObject>;
  requestBodies?: Record<string, RequestBodyObject | ReferenceObject>;
  headers?: Record<string, HeaderObject | ReferenceObject>;
  securitySchemes?: Record<string, SecuritySchemeObject | ReferenceObject>;
  links?: Record<string, LinkObject | ReferenceObject>;
  callbacks?: Record<
    string,
    Record<string, PathItemObject> | ReferenceObject
  >;
  pathItems?: Record<string, PathItemObject | ReferenceObject>;
}

export interface OpenAPIDocument {
  openapi: "3.1.0";
  info: OpenAPIInfoObject;
  servers?: ServerObject[];
  paths: PathsObject;
  components?: ComponentsObject;
  security?: SecurityRequirement[];
  tags?: TagObject[];
  externalDocs?: ExternalDocsObject;
  jsonSchemaDialect?: string;
  webhooks?: Record<string, PathItemObject | ReferenceObject>;
  [key: `x-${string}`]: unknown;
}

// ============================================================================
// OpenAPI Generation Options
// ============================================================================

export interface OpenAPIGenerateOptions {
  /** OpenAPI info object */
  info: {
    title: string;
    version: string;
    description?: string;
    termsOfService?: string;
    contact?: { name?: string; url?: string; email?: string };
    license?: { name: string; url?: string };
  };
  /** Server URLs */
  servers?: Array<{ url: string; description?: string }>;
  /** Global security schemes */
  securitySchemes?: Record<string, SecuritySchemeObject>;
  /** Global security requirements */
  security?: SecurityRequirement[];
  /** External docs */
  externalDocs?: { url: string; description?: string };
  /** Custom x- extensions on the root document */
  extensions?: Record<string, unknown>;
}

// ============================================================================
// Diff Types
// ============================================================================

export interface DiffEntry {
  type: "added" | "removed" | "modified";
  breaking: boolean;
  path: string;
  description: string;
  before?: unknown;
  after?: unknown;
}

export interface DiffResult {
  breaking: DiffEntry[];
  nonBreaking: DiffEntry[];
  /** Overall: true if any breaking changes exist */
  hasBreakingChanges: boolean;
  summary: {
    added: number;
    removed: number;
    modified: number;
    breaking: number;
    nonBreaking: number;
  };
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

// ============================================================================
// Auth Config (used by UI, collections, snippets)
// ============================================================================

export interface AuthConfig {
  type: "bearer" | "basic" | "apikey" | "oauth2";
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  keyName?: string;
  keyIn?: "header" | "query";
}

// ============================================================================
// watchfn Integration Types
// ============================================================================

export interface EndpointMetrics {
  method: string;
  path: string;
  latency: { p50: number; p95: number; p99: number; avg: number };
  throughput: { rpm: number; total: number };
  errors: { rate: number; count: number; lastError?: string };
  availability: number;
  lastUpdated: string;
}

export interface WatchFnClient {
  fetchMetrics(options?: {
    timeRange?: string;
    endpoints?: string[];
  }): Promise<EndpointMetrics[]>;
}

// ============================================================================
// secfn Integration Types
// ============================================================================

export interface RateLimitInfo {
  endpoint: string;
  method: string;
  remaining: number;
  limit: number;
  resetAt: number;
  blocked: boolean;
}

export interface SecFnRateLimiter {
  peek(endpoint: string, context?: Record<string, string>): Promise<RateLimitInfo | null>;
}

// ============================================================================
// authfn Integration Types
// ============================================================================

export interface AuthFnClient {
  baseUrl: string;
  adminKey?: string;
}

// ============================================================================
// logfn Integration Types
// ============================================================================

export interface LogFnClient {
  info(eventType: string, payload?: unknown): void;
  error(eventType: string, error: Error | string, payload?: unknown): void;
  warn(eventType: string, payload?: unknown): void;
  debug(eventType: string, payload?: unknown): void;
  child(context: Record<string, unknown>): LogFnClient;
}

// ============================================================================
// Code Snippet Types
// ============================================================================

export type SnippetTarget =
  | "curl"
  | "fetch"
  | "axios"
  | "node-fetch"
  | "python-requests"
  | "python-httpx"
  | "go-http"
  | "ruby-net-http"
  | "php-curl"
  | "csharp-httpclient"
  | "java-okhttp";

export interface SnippetOptions {
  /** Target language/library */
  target: SnippetTarget;
  /** Include auth headers */
  auth?: { type: string; token?: string; key?: string };
  /** Base URL */
  baseUrl: string;
  /** Indentation (default: 2 spaces) */
  indent?: number;
}

// ============================================================================
// Mock Server Types
// ============================================================================

export interface MockServerOptions {
  /** OpenAPI document */
  spec: OpenAPIDocument;
  /** Port (default: 4010) */
  port?: number;
  /** Generate responses from examples or schema (default: "schema") */
  responseMode?: "examples" | "schema" | "random";
  /** Validate incoming requests against schemas */
  validateRequests?: boolean;
  /** Delay responses by ms (simulates latency) */
  delay?: number;
  /** Maximum accepted request body size in bytes (default: 10 MiB) */
  maxRequestBodyBytes?: number;
  /** CORS configuration */
  cors?: boolean | CorsOptions;
}

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: HttpMethod[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}
