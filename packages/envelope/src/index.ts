export type EnvelopeMeta = {
  timestamp: string;
};

export type SuccessEnvelope<T> = {
  ok: true;
  data: T;
  meta: EnvelopeMeta;
};

export type CanonicalEnvelopeError = {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type ErrorEnvelope = {
  ok: false;
  error: CanonicalEnvelopeError;
  meta: EnvelopeMeta;
};

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export type LegacySuccessEnvelope<T> =
  | { ok: true; data: T }
  | { ok: true; result: T }
  | SuccessEnvelope<T>;

export type LegacyErrorEnvelope =
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
        status?: number;
        retryable?: boolean;
      };
    }
  | ErrorEnvelope;

export function ok<T>(data: T, options?: { timestamp?: string }): SuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      timestamp: options?.timestamp ?? new Date().toISOString(),
    },
  };
}

export function err(
  input: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  },
  options?: { timestamp?: string }
): ErrorEnvelope {
  if (!isValidErrorShape(input)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_ENVELOPE_ERROR_SHAPE',
        message: 'Canonical error envelopes require numeric status and boolean retryable',
        status: 500,
        retryable: false,
      },
      meta: {
        timestamp: options?.timestamp ?? new Date().toISOString(),
      },
    };
  }

  return {
    ok: false,
    error: {
      code: input.code,
      message: input.message,
      status: input.status,
      retryable: input.retryable,
      details: input.details,
    },
    meta: {
      timestamp: options?.timestamp ?? new Date().toISOString(),
    },
  };
}

export function normalizeLegacyEnvelope<T>(
  envelope: LegacySuccessEnvelope<T> | LegacyErrorEnvelope,
  options?: { timestamp?: string; defaultStatus?: number; defaultRetryable?: boolean }
): Envelope<T> {
  if ('meta' in envelope && typeof envelope.meta?.timestamp === 'string') {
    if (envelope.ok === true && 'data' in envelope) {
      return envelope;
    }
    if (envelope.ok === false && 'error' in envelope && isValidErrorShape(envelope.error)) {
      return envelope;
    }
  }

  if (envelope.ok === true && 'data' in envelope) {
    return ok(envelope.data, options);
  }
  if (envelope.ok === true && 'result' in envelope) {
    return ok(envelope.result, options);
  }
  if (!('error' in envelope) || !envelope.error) {
    return err(
      {
        code: 'INVALID_ENVELOPE_ERROR_SHAPE',
        message: 'Legacy error envelopes require an error payload',
        status: options?.defaultStatus ?? 500,
        retryable: options?.defaultRetryable ?? false,
      },
      options
    );
  }
  if (!isLegacyErrorInput(envelope.error)) {
    return err(
      {
        code: 'INVALID_ENVELOPE_ERROR_SHAPE',
        message: 'Legacy error envelopes require string code and message fields',
        status: options?.defaultStatus ?? 500,
        retryable: options?.defaultRetryable ?? false,
      },
      options
    );
  }

  return err(
    {
      code: envelope.error.code,
      message: envelope.error.message,
      status: envelope.error.status ?? options?.defaultStatus ?? 500,
      retryable: envelope.error.retryable ?? options?.defaultRetryable ?? false,
      details: envelope.error.details,
    },
    options
  );
}

export function toLegacyDataEnvelope<T>(envelope: Envelope<T>):
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } } {
  if ('error' in envelope) {
    return {
      ok: false,
      error: {
        code: envelope.error.code,
        message: envelope.error.message,
        ...(envelope.error.details ? { details: envelope.error.details } : {}),
      },
    };
  }

  return { ok: true, data: envelope.data };
}

export function toLegacyResultEnvelope<T>(envelope: Envelope<T>):
  | { ok: true; result: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } } {
  if ('error' in envelope) {
    return {
      ok: false,
      error: {
        code: envelope.error.code,
        message: envelope.error.message,
        ...(envelope.error.details ? { details: envelope.error.details } : {}),
      },
    };
  }

  return { ok: true, result: envelope.data };
}

function isValidErrorShape(input: {
  code: string;
  message: string;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}): input is {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;
} {
  return typeof input.status === 'number' && Number.isFinite(input.status) && typeof input.retryable === 'boolean';
}

function isLegacyErrorInput(input: unknown): input is {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status?: number;
  retryable?: boolean;
} {
  return (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { code?: unknown }).code === 'string' &&
    typeof (input as { message?: unknown }).message === 'string'
  );
}
