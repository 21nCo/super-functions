/**
 * Execution Timing Middleware (OBS-001 through OBS-004)
 * Provides structured phase-level timing for query, mutation, and sync operations.
 */

/**
 * Timing event emitted after each operation completes.
 * Contains phase-by-phase duration breakdown.
 * MUST NOT include record data, filter values, or credentials.
 */
export interface ExecutionTimingEvent {
  endpoint: string;
  resource?: string;
  operation?: string;
  phases: Record<string, number>;
  totalMs: number;
  timestamp: string;
}

/**
 * Timer that tracks named execution phases.
 * Each phase is measured sequentially — starting a new phase ends the previous one.
 */
export class ExecutionTimer {
  private phases: Record<string, number> = {};
  private current: { name: string; start: number } | null = null;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /** Start a named phase. Automatically ends any in-progress phase. */
  startPhase(name: string): void {
    this.endPhase();
    this.current = { name, start: Date.now() };
  }

  /** End the current phase, recording its duration. */
  endPhase(): void {
    if (this.current) {
      this.phases[this.current.name] = Date.now() - this.current.start;
      this.current = null;
    }
  }

  /** Build the final timing event. Ends any in-progress phase. */
  build(endpoint: string, resource?: string, operation?: string): ExecutionTimingEvent {
    this.endPhase();
    const totalMs = Date.now() - this.startTime;
    this.phases.total = totalMs;
    return {
      endpoint,
      resource,
      operation,
      phases: { ...this.phases },
      totalMs,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Timing emitter function type. */
export type TimingEmitter = (event: ExecutionTimingEvent) => void;

/**
 * Create a timing emitter from observability config.
 * Returns null if timing is disabled (no overhead incurred).
 * Custom onTiming errors are caught and logged via the logger.
 */
export function createTimingEmitter(config?: {
  timing?: boolean;
  onTiming?: TimingEmitter;
}, logger?: import("../logger.js").DatafnLogger): TimingEmitter | null {
  if (!config?.timing) return null;

  const handler =
    config.onTiming ||
    ((event: ExecutionTimingEvent) => logger?.debug("[datafn:timing]", event as unknown as Record<string, unknown>));

  return (event: ExecutionTimingEvent) => {
    try {
      handler(event);
    } catch (e) {
      logger?.warn("Timing handler error", { error: String(e), operation: "timing" });
    }
  };
}
