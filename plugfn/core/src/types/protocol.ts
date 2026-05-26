export interface PlugFnResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface PlugFnApiError {
  code: string;
  message: string;
  status: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export type PlugFnApiEnvelope<T = unknown> =
  | {
      ok: true;
      data: T;
      meta?: PlugFnResponseMeta;
    }
  | {
      ok: false;
      error: PlugFnApiError;
      meta?: PlugFnResponseMeta;
    };
