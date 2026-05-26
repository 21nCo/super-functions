import type { Logger } from '../types/action.js';
import type { Adapter as DbAdapter } from '@superfunctions/db';
import {
  ensurePlugFnDatabaseAdapter,
  type PlugFnDatabaseStorageAdapter,
} from '../storage/adapters/database.js';

export interface ActionLogEntry {
  id: string;
  userId?: string;
  connectionId?: string;
  provider: string;
  action: string;
  status: 'success' | 'error';
  request?: any;
  response?: any;
  error?: string;
  durationMs: number;
  retries: number;
  cached: boolean;
  executedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Logging middleware for action execution
 */
export class LoggingMiddleware {
  private readonly adapter?: PlugFnDatabaseStorageAdapter;

  constructor(
    private logger: Logger,
    adapter?: DbAdapter | PlugFnDatabaseStorageAdapter,
    private options: { logRequests?: boolean; logResponses?: boolean } = {}
  ) {
    this.adapter = adapter ? ensurePlugFnDatabaseAdapter(adapter) : undefined;
  }

  /**
   * Log action start
   */
  logActionStart(provider: string, action: string, userId?: string): void {
    this.logger.info(`[${provider}] Starting ${action}`, { userId });
  }

  /**
   * Log action success
   */
  logActionSuccess(
    provider: string,
    action: string,
    duration: number,
    cached: boolean,
    userId?: string
  ): void {
    this.logger.info(
      `[${provider}] ${action} succeeded in ${duration}ms${cached ? ' (cached)' : ''}`,
      { userId, duration, cached }
    );
  }

  /**
   * Log action error
   */
  logActionError(
    provider: string,
    action: string,
    error: Error,
    duration: number,
    retries: number,
    userId?: string
  ): void {
    this.logger.error(`[${provider}] ${action} failed after ${retries} retries`, {
      error: error.message,
      stack: error.stack,
      duration,
      retries,
      userId,
    });
  }

  /**
   * Persist action log to storage
   */
  async persistActionLog(entry: Omit<ActionLogEntry, 'id'>): Promise<void> {
    if (!this.adapter) {
      return;
    }

    const logEntry: ActionLogEntry = {
      ...entry,
      id: this.generateLogId(),
      request: this.options.logRequests ? entry.request : undefined,
      response: this.options.logResponses ? entry.response : undefined,
    };

    try {
      await this.adapter.createActionLog(logEntry as unknown as Record<string, unknown>);
    } catch (error) {
      this.logger.error('Failed to persist action log', { error });
    }
  }

  /**
   * Log connection event
   */
  logConnection(event: 'created' | 'expired' | 'revoked', provider: string, userId: string): void {
    this.logger.info(`Connection ${event}: ${provider} for user ${userId}`, {
      event,
      provider,
      userId,
    });
  }

  /**
   * Log webhook event
   */
  logWebhook(provider: string, event: string, verified: boolean): void {
    this.logger.info(`Webhook received: ${provider}.${event} (verified: ${verified})`, {
      provider,
      event,
      verified,
    });
  }

  /**
   * Log rate limit hit
   */
  logRateLimit(provider: string, retryAfter?: number): void {
    this.logger.warn(`Rate limit hit: ${provider}${retryAfter ? `, retry after ${retryAfter}ms` : ''}`, {
      provider,
      retryAfter,
    });
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
