import {
  createMetricsEmitter,
  createNamespacedEmitter,
  type MetricsEmitter,
} from '@superfunctions/metrics';
import type { Metrics, ProviderMetrics, ActionMetrics } from '../types/config.js';

interface MetricEntry {
  provider: string;
  action: string;
  userId?: string;
  status: 'success' | 'error';
  duration: number;
  timestamp: Date;
  rateLimitHit?: boolean;
}

/**
 * Metrics collection middleware
 */
export class MetricsMiddleware {
  private metrics: MetricEntry[] = [];
  private maxEntries = 10000;
  private readonly emitter: MetricsEmitter;

  constructor(emitter: MetricsEmitter = createNamespacedEmitter('plugfn', createMetricsEmitter())) {
    this.emitter = emitter;
  }

  /**
   * Record an action execution
   */
  record(entry: Omit<MetricEntry, 'timestamp'>): void {
    this.emitter.track('action', entry);
    this.metrics.push({
      ...entry,
      timestamp: new Date(),
    });

    // Keep only recent entries
    if (this.metrics.length > this.maxEntries) {
      this.metrics = this.metrics.slice(-this.maxEntries);
    }
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(options: {
    timeRange?: 'last-hour' | 'last-24h' | 'last-7d' | 'last-30d';
    groupBy?: 'provider' | 'action' | 'user';
    provider?: string;
    userId?: string;
  } = {}): Metrics {
    const filtered = this.filterMetrics(options);

    const totalRequests = filtered.length;
    const successfulRequests = filtered.filter((m) => m.status === 'success').length;
    const failedRequests = filtered.filter((m) => m.status === 'error').length;
    const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
    
    const durations = filtered.map((m) => m.duration);
    const avgResponseTime = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const metrics: Metrics = {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate,
      avgResponseTime,
    };

    if (options.groupBy === 'provider') {
      metrics.byProvider = this.aggregateByProvider(filtered);
    }

    if (options.groupBy === 'action') {
      metrics.byAction = this.aggregateByAction(filtered);
    }

    return metrics;
  }

  /**
   * Filter metrics by options
   */
  private filterMetrics(options: {
    timeRange?: string;
    provider?: string;
    userId?: string;
  }): MetricEntry[] {
    let filtered = [...this.metrics];

    // Filter by time range
    if (options.timeRange) {
      const cutoff = this.getCutoffTime(options.timeRange);
      filtered = filtered.filter((m) => m.timestamp >= cutoff);
    }

    // Filter by provider
    if (options.provider) {
      filtered = filtered.filter((m) => m.provider === options.provider);
    }

    // Filter by user
    if (options.userId) {
      filtered = filtered.filter((m) => m.userId === options.userId);
    }

    return filtered;
  }

  /**
   * Aggregate metrics by provider
   */
  private aggregateByProvider(metrics: MetricEntry[]): ProviderMetrics[] {
    const byProvider = new Map<string, MetricEntry[]>();

    for (const metric of metrics) {
      if (!byProvider.has(metric.provider)) {
        byProvider.set(metric.provider, []);
      }
      byProvider.get(metric.provider)!.push(metric);
    }

    return Array.from(byProvider.entries()).map(([name, providerMetrics]) => {
      const requests = providerMetrics.length;
      const successful = providerMetrics.filter((m) => m.status === 'success').length;
      const successRate = (successful / requests) * 100;
      const avgResponseTime = providerMetrics.reduce((sum, m) => sum + m.duration, 0) / requests;
      const rateLimitHits = providerMetrics.filter((m) => m.rateLimitHit).length;

      return {
        name,
        requests,
        successRate,
        avgResponseTime,
        rateLimitHits,
      };
    });
  }

  /**
   * Aggregate metrics by action
   */
  private aggregateByAction(metrics: MetricEntry[]): ActionMetrics[] {
    const byAction = new Map<string, MetricEntry[]>();

    for (const metric of metrics) {
      const key = `${metric.provider}:${metric.action}`;
      if (!byAction.has(key)) {
        byAction.set(key, []);
      }
      byAction.get(key)!.push(metric);
    }

    return Array.from(byAction.entries()).map(([key, actionMetrics]) => {
      const [provider, action] = key.split(':');
      const requests = actionMetrics.length;
      const successful = actionMetrics.filter((m) => m.status === 'success').length;
      const successRate = (successful / requests) * 100;
      const avgResponseTime = actionMetrics.reduce((sum, m) => sum + m.duration, 0) / requests;

      return {
        provider,
        action,
        requests,
        successRate,
        avgResponseTime,
      };
    });
  }

  /**
   * Get cutoff time for time range
   */
  private getCutoffTime(timeRange: string): Date {
    const now = Date.now();
    
    switch (timeRange) {
      case 'last-hour':
        return new Date(now - 3600000);
      case 'last-24h':
        return new Date(now - 86400000);
      case 'last-7d':
        return new Date(now - 604800000);
      case 'last-30d':
        return new Date(now - 2592000000);
      default:
        return new Date(0);
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
}
