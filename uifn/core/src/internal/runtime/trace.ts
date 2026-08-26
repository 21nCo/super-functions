import { createUIFnError } from '../../errors';
import { deepFreeze, structuralEqual } from './immutable';
import type { RuntimeChangeMeta, RuntimeEvent, RuntimeTraceRecord, RuntimeTraceSink } from './types';

declare const __UIFN_DEV_TRACE__: boolean;

const SECRET_KEY = /(password|passcode|secret|token|authorization|cookie|clipboard|file|content|raw|value)/i;
const REDACTED = '[REDACTED]';

function sanitize(value: unknown, key = '', depth = 0): unknown {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitize(entry, key, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey, depth + 1)]));
  }
  return `[${typeof value}]`;
}

export function sanitizeTraceDetails(details: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> | undefined {
  if (!details) return undefined;
  return deepFreeze(sanitize(details) as Record<string, unknown>);
}

export interface RuntimeTraceBuffer {
  emit(record: Omit<RuntimeTraceRecord, 'sequence'>): void;
  snapshot(): readonly RuntimeTraceRecord[];
}

export function createRuntimeTraceBuffer(options: {
  enabled: boolean;
  limit: number;
  sink?: RuntimeTraceSink;
}): RuntimeTraceBuffer {
  if (!__UIFN_DEV_TRACE__ || !options.enabled || options.limit === 0) {
    return Object.freeze({ emit: () => undefined, snapshot: () => Object.freeze([]) });
  }
  let sequence = 0;
  const records: RuntimeTraceRecord[] = [];
  return {
    emit(record) {
      sequence += 1;
      const safe = deepFreeze({
        ...record,
        sequence,
        eventKeys: record.eventKeys ? [...record.eventKeys].sort() : undefined,
        changedKeys: record.changedKeys ? [...record.changedKeys] : undefined,
        details: sanitizeTraceDetails(record.details as Record<string, unknown> | undefined),
      }) as RuntimeTraceRecord;
      records.push(safe);
      if (records.length > options.limit) records.splice(0, records.length - options.limit);
      options.sink?.(safe);
    },
    snapshot() {
      return Object.freeze([...records]);
    },
  };
}

export function assertRuntimeChangeMeta<
  TEvent extends RuntimeEvent,
  TState,
  TContext,
  TComputed,
>(value: unknown): asserts value is RuntimeChangeMeta<TEvent, TState, TContext, TComputed> {
  const meta = value as Partial<RuntimeChangeMeta<TEvent, TState, TContext, TComputed>> | undefined;
  const valid = Boolean(
    meta &&
    Number.isInteger(meta.transactionId) &&
    typeof meta.event?.type === 'string' &&
    typeof meta.source === 'string' &&
    typeof meta.reason === 'string' &&
    Number.isInteger(meta.previousSnapshot?.version) &&
    Number.isInteger(meta.nextSnapshot?.version) &&
    Array.isArray(meta.changedKeys) &&
    typeof meta.timestamp === 'number'
  );
  if (!valid) {
    throw createUIFnError({
      code: 'UIFN_CHANGE_META_INVALID',
      package: '@uifn/core',
      component: 'RuntimeTrace',
      message: 'Runtime change metadata does not satisfy the typed semantic contract.',
    });
  }
}

export interface SemanticTraceEnvelope {
  readonly event?: unknown;
  readonly snapshot?: unknown;
  readonly callbacks?: unknown;
  readonly parts?: unknown;
  readonly dom?: unknown;
  readonly focus?: unknown;
  readonly cleanup?: unknown;
}

export interface SemanticTraceDifference {
  readonly path: keyof SemanticTraceEnvelope;
  readonly expected: unknown;
  readonly actual: unknown;
}

export function compareSemanticTrace(
  expected: SemanticTraceEnvelope,
  actual: SemanticTraceEnvelope,
): readonly SemanticTraceDifference[] {
  const paths: (keyof SemanticTraceEnvelope)[] = ['event', 'snapshot', 'callbacks', 'parts', 'dom', 'focus', 'cleanup'];
  return Object.freeze(paths
    .filter((path) => !structuralEqual(expected[path], actual[path]))
    .map((path) => deepFreeze({ path, expected: expected[path], actual: actual[path] })));
}

export function assertSemanticTraceEquivalent(expected: SemanticTraceEnvelope, actual: SemanticTraceEnvelope): void {
  const differences = compareSemanticTrace(expected, actual);
  if (differences.length > 0) {
    throw createUIFnError({
      code: 'UIFN_TRACE_DIVERGED',
      package: '@uifn/core',
      component: 'RuntimeTrace',
      message: 'Semantic trace comparison found a behavior divergence.',
      details: { paths: differences.map((difference) => difference.path) },
    });
  }
}

export function assertTraceContainsNoSecrets(trace: unknown, forbiddenValues: readonly string[] = []): void {
  const serialized = JSON.stringify(trace);
  const leaked = forbiddenValues.find((value) => value.length > 0 && serialized.includes(value));
  const suspiciousKey = /"(?:password|passcode|secret|authorization|clipboardContent|fileContent)"\s*:\s*"(?!\[REDACTED\])/i.test(serialized);
  if (leaked || suspiciousKey) {
    throw createUIFnError({
      code: 'UIFN_TRACE_SECRET',
      package: '@uifn/core',
      component: 'RuntimeTrace',
      message: 'Semantic trace contains forbidden user or secret content.',
      details: { leaked: Boolean(leaked), suspiciousKey },
    });
  }
}
