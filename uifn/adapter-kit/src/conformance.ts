export type AdapterFramework = 'react' | 'svelte' | 'solid';
export type SemanticTraceInstallMode = 'package' | 'source';
export type SemanticTraceResult = 'passed' | 'failed';
export type SemanticJsonPrimitive = string | number | boolean | null;
export type SemanticJsonValue =
  | SemanticJsonPrimitive
  | readonly SemanticJsonValue[]
  | { readonly [key: string]: SemanticJsonValue };

export interface SemanticTraceEnvironment {
  readonly runtime: string;
  readonly runtimeVersion: string;
  readonly frameworkVersion: string;
  readonly browser: string;
  readonly browserVersion: string;
  readonly os: string;
  readonly direction: 'ltr' | 'rtl';
  readonly locale: string;
  readonly timeZone: string;
}

export interface SemanticTraceStep {
  readonly sequence: number;
  readonly kind: 'event' | 'action' | 'update' | 'lifecycle';
  readonly name: string;
  readonly part?: string;
  readonly key?: string;
  readonly pointerType?: string;
  readonly defaultPrevented?: boolean;
  readonly propagationStopped?: boolean;
  readonly isComposing?: boolean;
  readonly currentTarget?: string;
  readonly arguments?: readonly SemanticJsonValue[];
}

export interface SemanticTraceTransaction {
  readonly sequence: number;
  readonly version: number;
  readonly status: string;
  readonly state: SemanticJsonValue;
  readonly event?: SemanticJsonValue;
  readonly source?: string;
  readonly reason?: string;
  readonly changedKeys: readonly string[];
}

export interface SemanticTraceAction {
  readonly sequence: number;
  readonly name: string;
  readonly arguments: readonly SemanticJsonValue[];
  readonly observed: boolean;
}

export interface SemanticTracePart {
  readonly part: string;
  readonly instance?: string;
  readonly tag: string;
  readonly role?: string;
  readonly id?: string;
  readonly tabIndex?: number;
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly aria: Readonly<Record<string, SemanticJsonPrimitive>>;
  readonly data: Readonly<Record<string, SemanticJsonPrimitive>>;
  readonly attributes: Readonly<Record<string, SemanticJsonPrimitive>>;
}

export interface SemanticTracePartCheckpoint {
  readonly checkpoint: string;
  readonly parts: readonly SemanticTracePart[];
}

export interface SemanticTraceDomCheckpoint {
  readonly checkpoint: string;
  readonly rootConnected: boolean;
  readonly semanticNodeCount: number;
  readonly formValues: Readonly<Record<string, SemanticJsonPrimitive>>;
}

export interface SemanticTraceFocusEntry {
  readonly sequence: number;
  readonly checkpoint: string;
  readonly part: string | null;
  readonly tag: string | null;
}

export interface SemanticTraceCallback {
  readonly sequence: number;
  readonly name: string;
  readonly arguments: readonly SemanticJsonValue[];
}

export interface SemanticTraceError {
  readonly sequence: number;
  readonly code: string;
  readonly operation: string;
  readonly recoverable: boolean;
}

export interface SemanticTraceCleanup {
  readonly controllerDestroyed: boolean;
  readonly domReleased: boolean;
  readonly subscriptions: number;
  readonly listeners: number;
  readonly observers: number;
  readonly timers: number;
  readonly frames: number;
  readonly portals: number;
  readonly layers: number;
  readonly locks: number;
  readonly inertRoots: number;
  readonly childServices: number;
  readonly connectedSemanticNodes: number;
}

export interface SemanticTrace {
  readonly schemaVersion: 1;
  readonly primitive: string;
  readonly framework: AdapterFramework;
  readonly installMode: SemanticTraceInstallMode;
  readonly vectorId: string;
  readonly environment: SemanticTraceEnvironment;
  readonly steps: readonly SemanticTraceStep[];
  readonly transactions: readonly SemanticTraceTransaction[];
  readonly actions: readonly SemanticTraceAction[];
  readonly parts: readonly SemanticTracePartCheckpoint[];
  readonly dom: readonly SemanticTraceDomCheckpoint[];
  readonly focus: readonly SemanticTraceFocusEntry[];
  readonly callbacks: readonly SemanticTraceCallback[];
  readonly errors: readonly SemanticTraceError[];
  readonly cleanup: SemanticTraceCleanup;
  readonly result: SemanticTraceResult;
}

export type SemanticTraceComparable = Omit<SemanticTrace, 'framework' | 'environment'> & {
  readonly environment: Pick<SemanticTraceEnvironment, 'direction' | 'locale' | 'timeZone'>;
};

export type SemanticTraceErrorCode =
  | 'UIFN_TRACE_SCHEMA_INCOMPLETE'
  | 'UIFN_TRACE_SCHEMA_INVALID'
  | 'UIFN_TRACE_NORMALIZATION_LOSSY'
  | 'UIFN_SEMANTIC_TRACE_DIVERGED'
  | 'UIFN_PARITY_FRAMEWORK_MISSING'
  | 'UIFN_PARITY_GOLDEN_MISSING';

export interface SemanticTraceIssue {
  readonly code: SemanticTraceErrorCode;
  readonly path: string;
  readonly message: string;
  readonly expected?: SemanticJsonValue;
  readonly actual?: SemanticJsonValue;
  readonly framework?: AdapterFramework;
  readonly primitive?: string;
  readonly vectorId?: string;
}

export interface SemanticTraceComparison {
  readonly ok: boolean;
  readonly issues: readonly SemanticTraceIssue[];
  readonly expected: SemanticTraceComparable;
  readonly actual: SemanticTraceComparable;
}

export interface SemanticParityInput {
  readonly golden: readonly SemanticTrace[];
  readonly traces: readonly SemanticTrace[];
  readonly frameworks?: readonly AdapterFramework[];
}

export interface SemanticParityResult {
  readonly ok: boolean;
  readonly compared: number;
  readonly frameworksPassed: readonly AdapterFramework[];
  readonly issues: readonly SemanticTraceIssue[];
}

const REQUIRED_TRACE_CHANNELS = [
  'steps',
  'transactions',
  'actions',
  'parts',
  'dom',
  'focus',
  'callbacks',
  'errors',
] as const;

const SECRET_KEY = /(?:password|secret|token|clipboard|file(?:content)?|authorization|cookie)/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function toSemanticJson(value: unknown, key = '', seen = new WeakSet<object>()): SemanticJsonValue {
  if (SECRET_KEY.test(key)) return '[redacted]';
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return sanitizeNumber(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  let sanitized: SemanticJsonValue;
  if (Array.isArray(value)) {
    sanitized = value.map((entry) => toSemanticJson(entry, key, seen));
  } else if (value instanceof Date) {
    sanitized = value.toISOString();
  } else if (!isPlainRecord(value)) {
    sanitized = Object.prototype.toString.call(value);
  } else {
    sanitized = Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((entry) => [entry, toSemanticJson(value[entry], entry, seen)]),
    );
  }
  seen.delete(value);
  return sanitized;
}

function addIssue(
  issues: SemanticTraceIssue[],
  code: SemanticTraceErrorCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

type TraceFieldValidator = (value: unknown) => boolean;

const traceString: TraceFieldValidator = (value) => typeof value === 'string';
const traceBoolean: TraceFieldValidator = (value) => typeof value === 'boolean';
const traceNumber: TraceFieldValidator = (value) => typeof value === 'number' && Number.isFinite(value);
const traceCount: TraceFieldValidator = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const traceNullableString: TraceFieldValidator = (value) => value === null || typeof value === 'string';
const traceStringArray: TraceFieldValidator = (value) => Array.isArray(value) && value.every(traceString);

function isSemanticJsonValue(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isSemanticJsonValue(entry, seen))
    : isPlainRecord(value) && Object.values(value).every((entry) => isSemanticJsonValue(entry, seen));
  seen.delete(value);
  return valid;
}

const traceJsonArray: TraceFieldValidator = (value) =>
  Array.isArray(value) && value.every((entry) => isSemanticJsonValue(entry));
const tracePrimitiveMap: TraceFieldValidator = (value) =>
  isPlainRecord(value) && Object.values(value).every((entry) =>
    entry === null || typeof entry === 'string' || typeof entry === 'boolean'
      || (typeof entry === 'number' && Number.isFinite(entry)));

function validateTraceRecord(
  issues: SemanticTraceIssue[],
  value: unknown,
  path: string,
  fields: Readonly<Record<string, TraceFieldValidator>>,
  optionalFields: Readonly<Record<string, TraceFieldValidator>> = {},
): Record<string, unknown> | undefined {
  if (!isPlainRecord(value)) {
    addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', path, `${path} MUST be an object.`);
    return undefined;
  }
  for (const [field, validator] of Object.entries(fields)) {
    if (!validator(value[field])) {
      addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', `${path}/${field}`, `${field} has an invalid or missing value.`);
    }
  }
  for (const [field, validator] of Object.entries(optionalFields)) {
    if (Object.hasOwn(value, field) && !validator(value[field])) {
      addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', `${path}/${field}`, `${field} has an invalid value.`);
    }
  }
  return value;
}

export function validateSemanticTrace(trace: unknown): readonly SemanticTraceIssue[] {
  const issues: SemanticTraceIssue[] = [];
  if (!isPlainRecord(trace)) {
    addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', '/', 'Semantic trace MUST be an object.');
    return issues;
  }
  if (trace.schemaVersion !== 1) addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', '/schemaVersion', 'schemaVersion MUST equal 1.');
  for (const field of ['primitive', 'framework', 'installMode', 'vectorId', 'result'] as const) {
    if (typeof trace[field] !== 'string') addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', `/${field}`, `${field} MUST be a string.`);
  }
  if (!['react', 'svelte', 'solid'].includes(String(trace.framework))) addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', '/framework', 'framework MUST be react, svelte, or solid.');
  if (!['package', 'source'].includes(String(trace.installMode))) addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', '/installMode', 'installMode MUST be package or source.');
  if (!['passed', 'failed'].includes(String(trace.result))) addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', '/result', 'result MUST be passed or failed.');
  const environment = validateTraceRecord(issues, trace.environment, '/environment', {
    runtime: traceString,
    runtimeVersion: traceString,
    frameworkVersion: traceString,
    browser: traceString,
    browserVersion: traceString,
    os: traceString,
    direction: (value) => value === 'ltr' || value === 'rtl',
    locale: traceString,
    timeZone: traceString,
  });
  void environment;
  for (const channel of REQUIRED_TRACE_CHANNELS) {
    if (!Array.isArray(trace[channel])) addIssue(issues, 'UIFN_TRACE_SCHEMA_INCOMPLETE', `/${channel}`, `${channel} MUST be present as an array.`);
  }
  const validateChannel = (
    name: string,
    fields: Readonly<Record<string, TraceFieldValidator>>,
    nested?: (entry: Record<string, unknown>, path: string) => void,
    optionalFields: Readonly<Record<string, TraceFieldValidator>> = {},
  ) => {
    const channel = trace[name];
    if (!Array.isArray(channel)) return;
    channel.forEach((entry, index) => {
      const path = `/${name}/${index}`;
      const record = validateTraceRecord(issues, entry, path, fields, optionalFields);
      if (record) nested?.(record, path);
    });
  };
  validateChannel('steps', {
    sequence: traceNumber,
    kind: (value) => typeof value === 'string' && ['event', 'action', 'update', 'lifecycle'].includes(value),
    name: traceString,
  }, undefined, {
    part: traceString,
    key: traceString,
    pointerType: traceString,
    defaultPrevented: traceBoolean,
    propagationStopped: traceBoolean,
    isComposing: traceBoolean,
    currentTarget: traceString,
    arguments: traceJsonArray,
  });
  validateChannel('transactions', {
    sequence: traceNumber,
    version: traceNumber,
    status: traceString,
    state: isSemanticJsonValue,
    changedKeys: traceStringArray,
  }, undefined, { event: isSemanticJsonValue, source: traceString, reason: traceString });
  validateChannel('actions', {
    sequence: traceNumber,
    name: traceString,
    arguments: traceJsonArray,
    observed: traceBoolean,
  });
  validateChannel('parts', { checkpoint: traceString, parts: Array.isArray }, (checkpoint, path) => {
    if (!Array.isArray(checkpoint.parts)) return;
    checkpoint.parts.forEach((part, index) => validateTraceRecord(
      issues,
      part,
      `${path}/parts/${index}`,
      {
        part: traceString,
        tag: traceString,
        hidden: traceBoolean,
        disabled: traceBoolean,
        aria: tracePrimitiveMap,
        data: tracePrimitiveMap,
        attributes: tracePrimitiveMap,
      },
      { instance: traceString, role: traceString, id: traceString, tabIndex: traceNumber },
    ));
  });
  validateChannel('dom', {
    checkpoint: traceString,
    rootConnected: traceBoolean,
    semanticNodeCount: traceCount,
    formValues: tracePrimitiveMap,
  });
  validateChannel('focus', {
    sequence: traceNumber,
    checkpoint: traceString,
    part: traceNullableString,
    tag: traceNullableString,
  });
  validateChannel('callbacks', {
    sequence: traceNumber,
    name: traceString,
    arguments: traceJsonArray,
  });
  validateChannel('errors', {
    sequence: traceNumber,
    code: traceString,
    operation: traceString,
    recoverable: traceBoolean,
  });
  validateTraceRecord(issues, trace.cleanup, '/cleanup', {
    controllerDestroyed: traceBoolean,
    domReleased: traceBoolean,
    subscriptions: traceCount,
    listeners: traceCount,
    observers: traceCount,
    timers: traceCount,
    frames: traceCount,
    portals: traceCount,
    layers: traceCount,
    locks: traceCount,
    inertRoots: traceCount,
    childServices: traceCount,
    connectedSemanticNodes: traceCount,
  });
  const serialized = toSemanticJson(trace);
  const inspect = (value: SemanticJsonValue, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => inspect(entry, `${path}/${index}`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (SECRET_KEY.test(key) && entry !== '[redacted]') addIssue(issues, 'UIFN_TRACE_SCHEMA_INVALID', `${path}/${key}`, 'Sensitive trace field was not redacted.');
        inspect(entry, `${path}/${key}`);
      }
    }
  };
  inspect(serialized, '');
  return issues;
}

function tokenizedIdentifier(
  value: SemanticJsonValue,
  identifiers: Map<string, string>,
): SemanticJsonValue {
  if (typeof value !== 'string' || !value) return value;
  const tokens = value.split(/(\s+)/).map((token) => {
    if (/^\s+$/.test(token) || !token) return token;
    let identifier = identifiers.get(token);
    if (!identifier) {
      identifier = `id-${identifiers.size + 1}`;
      identifiers.set(token, identifier);
    }
    return identifier;
  });
  return tokens.join('');
}

function normalizeIdentifiers(
  value: SemanticJsonValue,
  identifiers: Map<string, string>,
  key = '',
): SemanticJsonValue {
  if (Array.isArray(value)) return value.map((entry) => normalizeIdentifiers(entry, identifiers, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        normalizeIdentifiers(entry, identifiers, entryKey),
      ]),
    );
  }
  if (/^(?:id|for|controls|describedby|labelledby|owns|activedescendant|ariaControls|ariaDescribedby|ariaLabelledby|ariaOwns|ariaActivedescendant)$/i.test(key)) {
    return tokenizedIdentifier(value, identifiers);
  }
  return value;
}

function renumberTransactions(value: SemanticTraceComparable): SemanticTraceComparable {
  const versionMap = new Map<number, number>();
  const transactions = value.transactions.map((transaction, index) => {
    let version = versionMap.get(transaction.version);
    if (!version) {
      version = versionMap.size + 1;
      versionMap.set(transaction.version, version);
    }
    return { ...transaction, sequence: index + 1, version };
  });
  return { ...value, transactions };
}

export function normalizeSemanticTrace(trace: SemanticTrace): SemanticTraceComparable {
  const issues = validateSemanticTrace(trace);
  if (issues.length > 0) throw new SemanticTraceError(issues[0]);
  const environment = {
    direction: trace.environment.direction,
    locale: trace.environment.locale,
    timeZone: trace.environment.timeZone,
  } as const;
  const comparable = {
    schemaVersion: trace.schemaVersion,
    primitive: trace.primitive,
    installMode: trace.installMode,
    vectorId: trace.vectorId,
    environment,
    steps: trace.steps,
    transactions: trace.transactions,
    actions: trace.actions,
    parts: trace.parts,
    dom: trace.dom,
    focus: trace.focus,
    callbacks: trace.callbacks,
    errors: trace.errors,
    cleanup: trace.cleanup,
    result: trace.result,
  } satisfies SemanticTraceComparable;
  const sanitized = toSemanticJson(comparable);
  const normalized = normalizeIdentifiers(sanitized, new Map()) as unknown as SemanticTraceComparable;
  return renumberTransactions(normalized);
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function compareValues(
  expected: SemanticJsonValue,
  actual: SemanticJsonValue,
  path: string,
  issues: SemanticTraceIssue[],
): void {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      issues.push({ code: 'UIFN_SEMANTIC_TRACE_DIVERGED', path, message: 'Trace value kind differs.', expected, actual });
      return;
    }
    if (expected.length !== actual.length) {
      issues.push({ code: 'UIFN_SEMANTIC_TRACE_DIVERGED', path: `${path}/length`, message: 'Trace array length differs.', expected: expected.length, actual: actual.length });
    }
    const length = Math.min(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) compareValues(expected[index], actual[index], `${path}/${index}`, issues);
    return;
  }
  if (isPlainRecord(expected) || isPlainRecord(actual)) {
    if (!isPlainRecord(expected) || !isPlainRecord(actual)) {
      issues.push({ code: 'UIFN_SEMANTIC_TRACE_DIVERGED', path, message: 'Trace value kind differs.', expected, actual });
      return;
    }
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    for (const key of keys) {
      if (!(key in expected) || !(key in actual)) {
        issues.push({
          code: 'UIFN_SEMANTIC_TRACE_DIVERGED',
          path: `${path}/${escapePointer(key)}`,
          message: 'Trace field presence differs.',
          expected: key in expected ? (expected[key] as SemanticJsonValue) : null,
          actual: key in actual ? (actual[key] as SemanticJsonValue) : null,
        });
        continue;
      }
      compareValues(expected[key] as SemanticJsonValue, actual[key] as SemanticJsonValue, `${path}/${escapePointer(key)}`, issues);
    }
    return;
  }
  issues.push({ code: 'UIFN_SEMANTIC_TRACE_DIVERGED', path, message: 'Trace value differs.', expected, actual });
}

export function compareSemanticTraces(expectedTrace: SemanticTrace, actualTrace: SemanticTrace): SemanticTraceComparison {
  const expected = normalizeSemanticTrace(expectedTrace);
  const actual = normalizeSemanticTrace(actualTrace);
  const issues: SemanticTraceIssue[] = [];
  compareValues(
    expected as unknown as SemanticJsonValue,
    actual as unknown as SemanticJsonValue,
    '',
    issues,
  );
  return { ok: issues.length === 0, issues, expected, actual };
}

function traceKey(trace: Pick<SemanticTrace, 'primitive' | 'installMode' | 'vectorId'>): string {
  return `${trace.installMode}\u0000${trace.primitive}\u0000${trace.vectorId}`;
}

export function runSemanticParity(input: SemanticParityInput): SemanticParityResult {
  const frameworks = input.frameworks ?? ['react', 'svelte', 'solid'];
  const goldens = new Map(input.golden.map((trace) => [traceKey(trace), trace]));
  const traces = new Map(input.traces.map((trace) => [`${trace.framework}\u0000${traceKey(trace)}`, trace]));
  const issues: SemanticTraceIssue[] = [];
  let compared = 0;
  for (const [key, golden] of goldens) {
    for (const framework of frameworks) {
      const trace = traces.get(`${framework}\u0000${key}`);
      if (!trace) {
        issues.push({
          code: 'UIFN_PARITY_FRAMEWORK_MISSING',
          path: '/',
          message: `Missing ${framework} public-tree trace.`,
          framework,
          primitive: golden.primitive,
          vectorId: golden.vectorId,
        });
        continue;
      }
      const comparison = compareSemanticTraces(golden, trace);
      compared += 1;
      issues.push(...comparison.issues.map((issue) => ({
        ...issue,
        framework,
        primitive: trace.primitive,
        vectorId: trace.vectorId,
      })));
    }
  }
  for (const trace of input.traces) {
    if (!goldens.has(traceKey(trace))) {
      issues.push({
        code: 'UIFN_PARITY_GOLDEN_MISSING',
        path: '/',
        message: 'Public-tree trace has no reviewed golden.',
        framework: trace.framework,
        primitive: trace.primitive,
        vectorId: trace.vectorId,
      });
    }
  }
  const frameworksPassed = frameworks.filter((framework) => !issues.some((issue) => issue.framework === framework));
  return { ok: issues.length === 0, compared, frameworksPassed, issues };
}

export function assertSemanticParity(result: SemanticParityResult): SemanticParityResult {
  if (!result.ok) throw new SemanticTraceError(result.issues[0]);
  return result;
}

export class SemanticTraceError extends Error {
  declare readonly code: string;
  readonly uifnCode: SemanticTraceErrorCode;
  readonly path: string;
  readonly issue: SemanticTraceIssue;

  constructor(issue: SemanticTraceIssue) {
    super(`${issue.code} at ${issue.path || '/'}: ${issue.message}`);
    this.name = 'SemanticTraceError';
    Object.defineProperty(this, 'code', { configurable: true, enumerable: true, value: issue.code });
    this.uifnCode = issue.code;
    this.path = issue.path || '/';
    this.issue = issue;
  }
}
