import type {
  ActionOptions,
  ActionResult,
  ActionContext,
  BatchAction,
  BatchResult,
} from '../types/action.js';
import type { Provider } from '../types/provider.js';
import { AuthType } from '../types/provider.js';
import type { Logger } from '../types/action.js';
import type { Credentials } from '../types/connection.js';
import type { Adapter as DbAdapter, KVStoreAdapter } from '@superfunctions/db';
import { ConnectionManager } from './connection-manager.js';
import { ProviderRegistry } from './provider-registry.js';
import { RetryMiddleware } from '../middleware/retry.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { CacheMiddleware } from '../middleware/caching.js';
import { LoggingMiddleware } from '../middleware/logging.js';
import { MetricsMiddleware } from '../middleware/metrics.js';
import { FetchHttpClient } from '../utils/request.js';
import { ApiKeyAuthHandler } from '../auth/api-key-auth.js';
import { BasicAuthHandler } from '../auth/basic-auth.js';

/**
 * Action executor handles executing provider actions
 */
export class ActionExecutor {
  private httpClient: FetchHttpClient;
  private retryMiddleware: RetryMiddleware;
  private rateLimiter: RateLimiter;
  private cacheMiddleware: CacheMiddleware;
  private loggingMiddleware: LoggingMiddleware;
  private metricsMiddleware: MetricsMiddleware;
  private readonly syncExecutionQueue = new Map<string, Promise<void>>();
  private readonly maxConcurrentSyncPerConnection: number;
  private readonly enableRetry: boolean;
  private readonly enableRateLimit: boolean;
  private readonly enableCache: boolean;
  private readonly enableLogging: boolean;
  private readonly enableMetrics: boolean;

  constructor(
    private connectionManager: ConnectionManager,
    private providerRegistry: ProviderRegistry,
    private logger: Logger,
    _options: {
      enableRetry?: boolean;
      enableRateLimit?: boolean;
      enableCache?: boolean;
      enableLogging?: boolean;
      enableMetrics?: boolean;
      maxConcurrentSyncPerConnection?: number;
      database?: DbAdapter;
      cacheStore?: KVStoreAdapter;
      cacheTtl?: number;
      cacheKeyPrefix?: string;
    } = {}
  ) {
    this.httpClient = new FetchHttpClient();
    this.retryMiddleware = new RetryMiddleware({}, logger);
    this.rateLimiter = new RateLimiter();
    this.cacheMiddleware = new CacheMiddleware(_options.cacheTtl ?? 300000, logger, {
      store: _options.cacheStore,
      keyPrefix: _options.cacheKeyPrefix,
    });
    this.loggingMiddleware = new LoggingMiddleware(logger, _options.database);
    this.metricsMiddleware = new MetricsMiddleware();
    this.maxConcurrentSyncPerConnection = Math.max(1, _options.maxConcurrentSyncPerConnection ?? 1);
    this.enableRetry = _options.enableRetry !== false;
    this.enableRateLimit = _options.enableRateLimit !== false;
    this.enableCache = _options.enableCache !== false;
    this.enableLogging = _options.enableLogging !== false;
    this.enableMetrics = _options.enableMetrics !== false;
  }

  /**
   * Execute an action
   */
  async execute<T>(
    provider: string,
    action: string,
    options: ActionOptions
  ): Promise<ActionResult<T>> {
    const startTime = Date.now();
    let retries = 0;
    let cached = false;

    try {
      // Get provider
      const providerObj = this.providerRegistry.get(provider);
      if (!providerObj) {
        throw new Error(`Provider ${provider} not found`);
      }

      // Get action
      const actionObj = providerObj.actions[action];
      if (!actionObj) {
        throw new Error(`Action ${action} not found in provider ${provider}`);
      }

      // Validate parameters
      const validatedParams = actionObj.parameters.parse(options.params);
      const shouldUseCache =
        this.enableCache &&
        options.cache !== false &&
        (options.cache !== undefined || actionObj.cacheable === true);

      // Get or select connection
      const connection = await this.connectionManager.resolveConnectionForAction({
        userId: options.userId,
        provider,
        connectionId: options.connectionId,
      });

      if (!connection) {
        throw new Error(`No connection found for provider ${provider} and user ${options.userId}`);
      }

      const cacheKey = shouldUseCache
        ? typeof options.cache === 'object' && options.cache.key
          ? options.cache.key
          : this.cacheMiddleware.generateKey(
              provider,
              action,
              validatedParams,
              options.userId,
              connection.id
            )
        : undefined;

      // Check cache only after resolving the concrete connection.
      if (cacheKey) {
        const cachedResult = await this.cacheMiddleware.getEntry<T>(cacheKey);
        if (cachedResult.hit) {
          this.logger.debug(`Cache hit for ${provider}.${action}`);
          
          return {
            success: true,
            data: cachedResult.data,
            provider,
            action,
            cached: true,
            duration: Date.now() - startTime,
            retries: 0,
            timestamp: new Date(),
          };
        }
      }

      // Get credentials
      const credentials = await this.connectionManager.getCredentials(connection.id);

      // Apply rate limiting
      if (this.enableRateLimit && providerObj.rateLimit) {
        await this.rateLimiter.acquireMany(
          [`provider:${provider}`, `provider:${provider}:tenant:${options.userId}`],
          providerObj.rateLimit
        );
      }

      // Build action context
      const context: ActionContext = {
        userId: options.userId,
        connectionId: connection.id,
        provider: {
          name: providerObj.name,
          baseUrl: providerObj.baseUrl,
        },
        auth: {
          type: providerObj.auth.type,
          credentials,
        },
        http: this.createAuthenticatedHttpClient(providerObj, credentials, options.timeout),
        logger: this.logger,
      };

      // Execute action with retry
      const executeAction = async () => {
        return actionObj.execute(validatedParams, context);
      };

      const result = await this.executeWithSyncConcurrencyGuard(action, connection.id, async () => {
        if (!this.enableRetry) {
          return { data: await executeAction(), retries: 0 };
        }
        return this.retryMiddleware.execute(
          executeAction,
          `${provider}.${action}`,
          options.retry ?? {}
        );
      });

      retries = result.retries;
      const data = result.data;

      // Validate response
      const validatedData = actionObj.returns.parse(data);

      // Cache result
      if (cacheKey) {
        const ttl = typeof options.cache === 'object' ? options.cache.ttl : undefined;
        await this.cacheMiddleware.set(cacheKey, validatedData, ttl);
      }

      // Mark connection as used
      await this.connectionManager.markUsed(connection.id);

      // Log success
      const duration = Date.now() - startTime;
      if (this.enableLogging) {
        this.loggingMiddleware.logActionSuccess(provider, action, duration, cached, options.userId);
        await this.loggingMiddleware.persistActionLog({
          provider,
          action,
          userId: options.userId,
          connectionId: connection.id,
          status: 'success',
          durationMs: duration,
          retries,
          cached,
          executedAt: new Date(),
          metadata: {
            cacheKey,
          },
        });
      }

      // Record metrics
      if (this.enableMetrics) {
        this.metricsMiddleware.record({
          provider,
          action,
          userId: options.userId,
          status: 'success',
          duration,
        });
      }

      return {
        success: true,
        data: validatedData,
        provider,
        action,
        cached,
        duration,
        retries,
        timestamp: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error as Error;

      // Log error
      if (this.enableLogging) {
        this.loggingMiddleware.logActionError(provider, action, err, duration, retries, options.userId);
        await this.loggingMiddleware.persistActionLog({
          provider,
          action,
          userId: options.userId,
          connectionId: options.connectionId,
          status: 'error',
          error: err.message,
          durationMs: duration,
          retries,
          cached,
          executedAt: new Date(),
        });
      }

      // Record metrics
      if (this.enableMetrics) {
        this.metricsMiddleware.record({
          provider,
          action,
          userId: options.userId,
          status: 'error',
          duration,
        });
      }

      return {
        success: false,
        error: err,
        provider,
        action,
        duration,
        retries,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute multiple actions in batch
   */
  async batch(actions: BatchAction[]): Promise<BatchResult[]> {
    const promises = actions.map((action) =>
      this.execute(action.provider, action.action, {
        userId: action.userId,
        connectionId: action.connectionId,
        params: action.params,
        cache: action.cache,
        timeout: action.timeout,
      })
    );

    return Promise.all(promises);
  }

  /**
   * Get metrics
   */
  getMetrics(options: any) {
    return this.metricsMiddleware.getMetrics(options);
  }

  /**
   * Create HTTP client with authentication
   */
  private createAuthenticatedHttpClient(
    provider: Provider,
    credentials: Credentials,
    defaultTimeout?: number
  ): any {
    const baseHeaders: Record<string, string> = {
      ...provider.headers,
    };

    // Add authentication headers based on auth type
    switch (provider.auth.type) {
      case AuthType.OAuth2:
        if (credentials.type === 'oauth2') {
          baseHeaders.Authorization = `Bearer ${credentials.accessToken}`;
        }
        break;

      case AuthType.ApiKey:
        if (credentials.type === 'api-key' && provider.auth.config) {
          const handler = new ApiKeyAuthHandler(provider.auth.config);
          Object.assign(baseHeaders, handler.addToHeaders({}, credentials));
        }
        break;

      case AuthType.JWT:
        if (credentials.type === 'jwt') {
          baseHeaders.Authorization = `Bearer ${credentials.token}`;
        }
        break;

      case AuthType.Basic:
        if (credentials.type === 'basic') {
          const handler = new BasicAuthHandler();
          Object.assign(baseHeaders, handler.addToHeaders({}, credentials));
        }
        break;
    }

    // Return wrapped HTTP client with auth headers
    return {
      get: (url: string, config?: any) =>
        this.httpClient.get(url, {
          ...config,
          timeout: config?.timeout ?? defaultTimeout,
          headers: { ...baseHeaders, ...config?.headers },
        }),
      post: (url: string, data?: any, config?: any) =>
        this.httpClient.post(url, data, {
          ...config,
          timeout: config?.timeout ?? defaultTimeout,
          headers: { ...baseHeaders, ...config?.headers },
        }),
      put: (url: string, data?: any, config?: any) =>
        this.httpClient.put(url, data, {
          ...config,
          timeout: config?.timeout ?? defaultTimeout,
          headers: { ...baseHeaders, ...config?.headers },
        }),
      patch: (url: string, data?: any, config?: any) =>
        this.httpClient.patch(url, data, {
          ...config,
          timeout: config?.timeout ?? defaultTimeout,
          headers: { ...baseHeaders, ...config?.headers },
        }),
      delete: (url: string, config?: any) =>
        this.httpClient.delete(url, {
          ...config,
          timeout: config?.timeout ?? defaultTimeout,
          headers: { ...baseHeaders, ...config?.headers },
        }),
    };
  }

  private async executeWithSyncConcurrencyGuard<T>(
    action: string,
    connectionId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    if (action !== 'mail.sync' || this.maxConcurrentSyncPerConnection > 1) {
      return execute();
    }

    const previous = this.syncExecutionQueue.get(connectionId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const queueTail = previous.catch(() => {}).then(() => current);
    this.syncExecutionQueue.set(connectionId, queueTail);

    await previous.catch(() => {});
    try {
      return await execute();
    } finally {
      releaseCurrent();
      if (this.syncExecutionQueue.get(connectionId) === queueTail) {
        this.syncExecutionQueue.delete(connectionId);
      }
    }
  }
}
