/**
 * @apifn/collections — Collection types
 *
 * Types for OpenCollection YAML read/write, environment management,
 * and collection runner.
 */

import type {
  AuthConfig,
  IntrospectOptions,
} from "@apifn/core";

// ============================================================================
// Collection Types
// ============================================================================

export interface Collection {
  /** Collection metadata from opencollection.yml */
  info: CollectionInfo;
  /** Environments */
  environments: Record<string, Environment>;
  /** Request items organized by folder */
  items: CollectionItem[];
  /** Root directory path */
  rootDir: string;
}

export interface CollectionInfo {
  name: string;
  version?: string;
  description?: string;
  type?: "collection";
}

export interface CollectionItem {
  kind: "request" | "folder";
  name: string;
  /** Relative path within the collection */
  path: string;
  /** For kind: "request" — the parsed OpenCollection request YAML */
  request?: OpenCollectionRequest;
  /** For kind: "folder" — child items */
  children?: CollectionItem[];
  /** Sequence number for ordering */
  seq?: number;
}

export interface OpenCollectionRequest {
  info: { name: string; type: "http"; seq?: number };
  http: {
    method: string;
    url: string;
    headers?: Array<{ name: string; value: string; enabled?: boolean }>;
    body?: { type: string; data: string };
    auth?: "inherit" | "none" | AuthConfig;
    params?: {
      path?: Array<{ name: string; value: string }>;
      query?: Array<{ name: string; value: string; enabled?: boolean }>;
    };
  };
  runtime?: {
    scripts?: Array<{
      type: "pre-request" | "tests" | "post-response";
      code: string;
    }>;
  };
  settings?: {
    encodeUrl?: boolean;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
    expectedStatus?: number | number[];
  };
}

// ============================================================================
// Environment Types
// ============================================================================

export interface Environment {
  name: string;
  variables: Record<string, string>;
}

// ============================================================================
// Collection Runner Types
// ============================================================================

export interface HttpClient {
  send(request: HttpClientRequest): Promise<HttpClientResponse>;
}

export interface CookieJarCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

export interface CookieJar {
  get(name: string, url?: string): string | undefined;
  set(name: string, value: string, url?: string): void;
  delete(name: string, url?: string): void;
  clear(): void;
  getCookieHeader(url: string): string | undefined;
  storeFromResponse(url: string, setCookieHeaders: string[]): void;
  toJSON(): CookieJarCookie[];
}

export interface HttpClientRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
}

export interface HttpRedirectRecord {
  status: number;
  url: string;
  location: string;
  duration: number;
}

export interface HttpClientResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  size: number;
  duration: number;
  redirects?: HttpRedirectRecord[];
}

export interface RunOptions {
  /** Environment to use */
  environment: string | Environment;
  /** Only run requests matching these paths/patterns */
  include?: string[];
  /** Skip requests matching these paths/patterns */
  exclude?: string[];
  /** Run requests in parallel (default: sequential) */
  parallel?: boolean;
  /** Max concurrent requests when parallel=true */
  concurrency?: number;
  /** Global timeout per request in ms (default: 30000) */
  timeout?: number;
  /** Abort on first failure */
  bail?: boolean;
  /** Number of retries for failed requests */
  retries?: number;
  /** Delay between sequential requests in ms */
  delay?: number;
  /** Custom HTTP client (default: built-in fetch-based) */
  httpClient?: HttpClient;
  /** Cookie jar shared across requests and collection scripts */
  cookieJar?: CookieJar;
  /** Reporter for progress updates */
  reporter?: RunReporter;
  /** Variables that override environment variables */
  overrides?: Record<string, string>;
  /** Headers to redact in captured request/response details */
  redactHeaders?: string[];
}

export interface RunReport {
  id: string;
  collectionName: string;
  environment: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  results: RequestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    duration: number;
  };
}

export interface RequestResult {
  name: string;
  path: string;
  method: string;
  url: string;
  status: "passed" | "failed" | "skipped" | "error";
  statusCode?: number;
  duration: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
    size: number;
    redirects?: HttpRedirectRecord[];
  };
  assertions: AssertionResult[];
  warnings?: string[];
  attempts?: Array<{
    attempt: number;
    statusCode?: number;
    duration: number;
    error?: string;
  }>;
  error?: string;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  error?: string;
}

export interface RunReporter {
  onStart?(collection: Collection, options: RunOptions): void;
  onRequestStart?(item: CollectionItem): void;
  onRequestComplete?(result: RequestResult): void;
  onComplete?(report: RunReport): void;
}

// ============================================================================
// Collection Generation Options
// ============================================================================

export interface CollectionGenerateOptions {
  baseUrl?: string;
  environmentName?: string;
  groupBy?: "tag" | "path";
  includeExamples?: boolean;
}

export type RouterCollectionOptions = CollectionGenerateOptions &
  IntrospectOptions;
