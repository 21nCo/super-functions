import { z } from 'zod';
import type { PlugFnActor } from './runtime.js';

/**
 * Action execution context
 */
export interface ActionContext<TCredentials = any> {
  userId: string;
  connectionId?: string;
  provider: {
    name: string;
    baseUrl: string;
  };
  auth: {
    type: string;
    credentials: TCredentials;
  };
  http: HttpClient;
  logger: Logger;
}

/**
 * HTTP client interface
 */
export interface HttpClient {
  get<T = any>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse<T>>;
  put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse<T>>;
  patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse<T>>;
  delete<T = any>(url: string, config?: RequestConfig): Promise<HttpResponse<T>>;
}

export interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
  bodyEncoding?: 'json' | 'form' | 'raw';
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

/**
 * Action definition
 */
export interface Action<TParams = any, TReturn = any> {
  name: string;
  displayName: string;
  description: string;
  /**
   * Opt in to caching when callers do not provide an explicit cache option.
   * Mutating actions should leave this unset or set it to false.
   */
  cacheable?: boolean;
  parameters: z.ZodSchema<TParams>;
  returns: z.ZodSchema<TReturn>;
  execute: (params: TParams, context: ActionContext) => Promise<TReturn>;
}

/**
 * Action execution options
 */
export interface ActionOptions<TParams = any> {
  userId: string;
  connectionId?: string;
  params: TParams;
  actor?: PlugFnActor;
  retry?: RetryOptions;
  timeout?: number;
  cache?: boolean | CacheOptions;
}

/**
 * Retry configuration
 */
export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  retryableStatusCodes?: number[];
}

/**
 * Cache configuration
 */
export interface CacheOptions {
  ttl?: number;
  key?: string;
}

/**
 * Action execution result
 */
export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  provider: string;
  action: string;
  cached?: boolean;
  duration: number;
  retries: number;
  timestamp: Date;
}

/**
 * Batch action request
 */
export interface BatchAction {
  provider: string;
  action: string;
  userId: string;
  connectionId?: string;
  params: Record<string, any>;
  cache?: boolean | CacheOptions;
}

/**
 * Batch action result
 */
export type BatchResult = ActionResult;
