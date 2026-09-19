import { secureRandomUUID } from "../utils/random.js";
import { redact } from "./redaction.js";
import { ObservabilityExporter, type ObservabilityExporterConfig } from "./exporter.js";
import type { SpanRecord } from "./storage.js";

export interface SpanStorage {
  saveSpan?(span: SpanRecord): Promise<unknown>;
}

export interface TraceSpanOptions {
  traceId?: string;
  parentSpanId?: string;
  metadata?: Record<string, unknown>;
}

export interface TracerConfig extends ObservabilityExporterConfig {
  storage?: SpanStorage;
  redactionKeys?: string[];
  exporterTimeoutMs?: number;
}

class TraceSpanHandle {
  readonly traceId: string;
  readonly spanId: string;
  private readonly startedAt = Date.now();
  private finished = false;

  constructor(
    private readonly tracer: Tracer,
    private readonly name: string,
    traceId: string,
    private readonly parentSpanId: string | undefined,
    private readonly metadata: Record<string, unknown>
  ) {
    this.traceId = traceId;
    this.spanId = randomId();
  }

  async start(): Promise<void> {
    await this.tracer.emit(this.name, {
      phase: "start",
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      metadata: this.metadata
    });
  }

  async fail(error: unknown): Promise<void> {
    await this.finish("error", error);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.finish("ok");
  }

  private async finish(status: "ok" | "error", error?: unknown): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;

    const serializedError = status === "error" ? serializeError(error) : undefined;
    const spanRecord = this.tracer.sanitize<SpanRecord>({
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      metadata: this.metadata,
      status,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      error: serializedError
    });
    const terminalPayload = {
      phase: status === "ok" ? "end" : "error",
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      metadata: this.metadata,
      error: serializedError
    };
    await Promise.allSettled([
      this.tracer.storage?.saveSpan?.(spanRecord) ?? Promise.resolve(),
      this.tracer.emit(this.name, terminalPayload),
    ]);
  }
}

export class Tracer {
  readonly storage?: SpanStorage;
  private readonly exporter: ObservabilityExporter;
  private readonly redactionKeys: string[];
  private readonly exporterTimeoutMs: number;

  constructor(config: TracerConfig = {}) {
    const storage = config.storage as SpanStorage | undefined;
    this.storage = typeof storage?.saveSpan === "function" ? storage : undefined;
    this.exporter = new ObservabilityExporter(config);
    this.redactionKeys = [...(config.redactionKeys ?? [])];
    this.exporterTimeoutMs = config.exporterTimeoutMs ?? 1_000;
    if (!Number.isSafeInteger(this.exporterTimeoutMs) || this.exporterTimeoutMs < 1) {
      throw new RangeError("exporterTimeoutMs must be a positive safe integer");
    }
  }

  createTraceId(): string {
    return randomId();
  }

  sanitize<T>(payload: T): T {
    return redact(payload, { keys: this.redactionKeys });
  }

  async emit(name: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const safePayload = this.sanitize(payload) as Record<string, unknown>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.exporter.emit(name, safePayload),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Observability exporter timed out")), this.exporterTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    return safePayload;
  }

  async span(name: string, options: TraceSpanOptions = {}): Promise<TraceSpanHandle> {
    const handle = new TraceSpanHandle(
      this,
      name,
      options.traceId ?? this.createTraceId(),
      options.parentSpanId,
      (this.sanitize(options.metadata ?? {}) as Record<string, unknown>)
    );
    await handle.start();
    return handle;
  }

  async trace<T>(
    name: string,
    metadata: Record<string, unknown>,
    fn: () => Promise<T>,
    options: Omit<TraceSpanOptions, "metadata"> = {}
  ): Promise<T> {
    let span: TraceSpanHandle;
    try {
      span = await this.span(name, { ...options, metadata });
    } catch {
      return await fn();
    }
    try {
      return await fn();
    } catch (error) {
      try {
        await span.fail(error);
      } catch {
        // Observability is secondary: never replace the operation's primary failure.
      }
      throw error;
    } finally {
      try {
        await span[Symbol.asyncDispose]();
      } catch {
        // Generated observability must not replace a successful operation.
      }
    }
  }
}

function randomId(): string {
  return secureRandomUUID();
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const serialized: Record<string, unknown> = {};
    for (const field of ["name", "message", "code"] as const) {
      if (typeof candidate[field] === "string") serialized[field] = candidate[field];
    }
    if (Object.keys(serialized).length > 0) return serialized;
  }
  return { message: String(error) };
}
