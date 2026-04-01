import { createExtfnError } from '../errors.js';
import type { RuntimeAddress } from '../types.js';

export interface RuntimeRequestEnvelope {
  v: 1;
  kind: 'request';
  requestId: string;
  namespace: string;
  method: string;
  source: RuntimeAddress;
  target: RuntimeAddress;
  payload: unknown;
  timeoutMs?: number;
}

export interface RuntimeResponseEnvelope {
  v: 1;
  kind: 'response';
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface RuntimeEventEnvelope {
  v: 1;
  kind: 'event';
  namespace: string;
  event: string;
  source: RuntimeAddress;
  payload: unknown;
}

export type PortCloseReason =
  | 'client-closed'
  | 'target-closed'
  | 'background-restarted'
  | 'context-unavailable'
  | 'protocol-error';

export interface RuntimePortEnvelope {
  v: 1;
  kind: 'port-message';
  portId: string;
  channel: string;
  seq: number;
  source: RuntimeAddress;
  payload: unknown;
}

export interface RuntimePortCloseEnvelope {
  v: 1;
  kind: 'port-close';
  portId: string;
  channel: string;
  source: RuntimeAddress;
  reason: PortCloseReason;
}

export function createRequestEnvelope(
  input: Omit<RuntimeRequestEnvelope, 'v' | 'kind'>
): RuntimeRequestEnvelope {
  const envelope: RuntimeRequestEnvelope = {
    v: 1,
    kind: 'request',
    ...input,
  };
  assertValidRequestEnvelope(envelope);
  return envelope;
}

export function createSuccessResponseEnvelope(
  requestId: string,
  result: unknown
): RuntimeResponseEnvelope {
  return {
    v: 1,
    kind: 'response',
    requestId,
    ok: true,
    result,
  };
}

export function createErrorResponseEnvelope(
  requestId: string,
  error: {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    details?: Record<string, unknown>;
  }
): RuntimeResponseEnvelope {
  return {
    v: 1,
    kind: 'response',
    requestId,
    ok: false,
    error,
  };
}

export function createEventEnvelope(
  input: Omit<RuntimeEventEnvelope, 'v' | 'kind'>
): RuntimeEventEnvelope {
  const envelope: RuntimeEventEnvelope = {
    v: 1,
    kind: 'event',
    ...input,
  };
  assertValidEventEnvelope(envelope);
  return envelope;
}

export function createPortEnvelope(
  input: Omit<RuntimePortEnvelope, 'v' | 'kind'>
): RuntimePortEnvelope {
  const envelope: RuntimePortEnvelope = {
    v: 1,
    kind: 'port-message',
    ...input,
  };
  assertValidPortEnvelope(envelope);
  return envelope;
}

export function createPortCloseEnvelope(
  input: Omit<RuntimePortCloseEnvelope, 'v' | 'kind'>
): RuntimePortCloseEnvelope {
  const envelope: RuntimePortCloseEnvelope = {
    v: 1,
    kind: 'port-close',
    ...input,
  };
  assertValidPortCloseEnvelope(envelope);
  return envelope;
}

export function assertValidRequestEnvelope(
  envelope: RuntimeRequestEnvelope
): RuntimeRequestEnvelope {
  assertField(envelope.v === 1, 'Request envelope is missing required field: v');
  assertField(
    envelope.kind === 'request',
    'Request envelope is missing required field: kind'
  );
  assertField(Boolean(envelope.requestId), 'Request envelope is missing required field: requestId');
  assertField(Boolean(envelope.namespace), 'Request envelope is missing required field: namespace');
  assertField(Boolean(envelope.method), 'Request envelope is missing required field: method');
  assertField(Boolean(envelope.source), 'Request envelope is missing required field: source');
  assertField(Boolean(envelope.target), 'Request envelope is missing required field: target');
  if (!('payload' in envelope)) {
    throw createExtfnError(
      'E_RUNTIME_PROTOCOL',
      'Request envelope is missing required field: payload'
    );
  }
  return envelope;
}

export function assertValidResponseEnvelope(
  envelope: RuntimeResponseEnvelope
): RuntimeResponseEnvelope {
  assertField(envelope.v === 1, 'Response envelope is missing required field: v');
  assertField(
    envelope.kind === 'response',
    'Response envelope is missing required field: kind'
  );
  assertField(Boolean(envelope.requestId), 'Response envelope is missing required field: requestId');
  if (envelope.ok) {
    if ('error' in envelope && envelope.error !== undefined) {
      throw createExtfnError(
        'E_RUNTIME_PROTOCOL',
        'Successful response envelopes must not include error.'
      );
    }
  } else {
    if (!envelope.error) {
      throw createExtfnError(
        'E_RUNTIME_PROTOCOL',
        'Failed response envelopes must include error.'
      );
    }
  }
  return envelope;
}

export function assertValidEventEnvelope(
  envelope: RuntimeEventEnvelope
): RuntimeEventEnvelope {
  assertField(envelope.v === 1, 'Event envelope is missing required field: v');
  assertField(envelope.kind === 'event', 'Event envelope is missing required field: kind');
  assertField(Boolean(envelope.namespace), 'Event envelope is missing required field: namespace');
  assertField(Boolean(envelope.event), 'Event envelope is missing required field: event');
  assertField(Boolean(envelope.source), 'Event envelope is missing required field: source');
  if (!('payload' in envelope)) {
    throw createExtfnError(
      'E_RUNTIME_PROTOCOL',
      'Event envelope is missing required field: payload'
    );
  }
  return envelope;
}

export function assertValidPortEnvelope(
  envelope: RuntimePortEnvelope
): RuntimePortEnvelope {
  assertField(envelope.v === 1, 'Port envelope is missing required field: v');
  assertField(
    envelope.kind === 'port-message',
    'Port envelope is missing required field: kind'
  );
  assertField(Boolean(envelope.portId), 'Port envelope is missing required field: portId');
  assertField(Boolean(envelope.channel), 'Port envelope is missing required field: channel');
  assertField(typeof envelope.seq === 'number', 'Port envelope is missing required field: seq');
  assertField(Boolean(envelope.source), 'Port envelope is missing required field: source');
  if (!('payload' in envelope)) {
    throw createExtfnError(
      'E_RUNTIME_PROTOCOL',
      'Port envelope is missing required field: payload'
    );
  }
  return envelope;
}

export function assertValidPortCloseEnvelope(
  envelope: RuntimePortCloseEnvelope
): RuntimePortCloseEnvelope {
  assertField(envelope.v === 1, 'Port close envelope is missing required field: v');
  assertField(
    envelope.kind === 'port-close',
    'Port close envelope is missing required field: kind'
  );
  assertField(Boolean(envelope.portId), 'Port close envelope is missing required field: portId');
  assertField(Boolean(envelope.channel), 'Port close envelope is missing required field: channel');
  assertField(Boolean(envelope.source), 'Port close envelope is missing required field: source');
  assertField(Boolean(envelope.reason), 'Port close envelope is missing required field: reason');
  return envelope;
}

function assertField(condition: boolean, message: string): void {
  if (!condition) {
    throw createExtfnError('E_RUNTIME_PROTOCOL', message);
  }
}
