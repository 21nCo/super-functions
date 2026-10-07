export interface WatchFnLike {
  track(name: string, payload: Record<string, unknown>): void;
}

export interface SpanExporterLike {
  export(name: string, payload: Record<string, unknown>): Promise<void> | void;
}

export interface OtlpExporterLike {
  export(payload: Record<string, unknown>): Promise<void> | void;
}

export interface ObservabilityExporterConfig {
  watch?: WatchFnLike;
  exporter?: SpanExporterLike;
  otlpExporter?: OtlpExporterLike;
}

export class ObservabilityExporter {
  constructor(private readonly config: ObservabilityExporterConfig = {}) {}

  async emit(name: string, payload: Record<string, unknown>): Promise<void> {
    this.config.watch?.track(name, payload);
    await this.config.exporter?.export(name, payload);
    await this.config.otlpExporter?.export({ name, ...payload });
  }
}
