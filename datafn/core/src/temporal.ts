import type { DatafnPlugin, DatafnResourceSchema, DatafnSchema } from "./types.js";

export type DatafnTemporalScale =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type DatafnTemporalStorage = "unix-ms" | "unix-s" | "date" | "iso";

export type DatafnTemporalRangeInput = {
  start: string | number | Date;
  end: string | number | Date;
};

export type DatafnTemporalLocalTimeInput = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

export type DatafnTemporalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

export type DatafnTemporalPeriodInput = {
  scale: DatafnTemporalScale;
  at?: string | number | Date;
};

export type DatafnTemporalGroupInput = {
  scale: DatafnTemporalScale;
  alias?: string;
  output?: DatafnTemporalStorage;
  weekStartsOn?: number;
};

export type DatafnTemporalBucketInput = {
  value: string | number | Date;
  scale: DatafnTemporalScale;
  timezone?: string;
  storage?: DatafnTemporalStorage;
  output?: DatafnTemporalStorage;
  weekStartsOn?: number;
  field?: string;
  resource?: string;
  record?: Record<string, unknown>;
};

export type DatafnTemporalClause = {
  field: string;
  timezone?: string;
  storage?: DatafnTemporalStorage;
  weekStartsOn?: number;
  range?: DatafnTemporalRangeInput;
  period?: DatafnTemporalPeriodInput;
  groupBy?: DatafnTemporalGroupInput;
};

export type DatafnTemporalConfig = {
  timezone?: string | (() => string | undefined);
  timezoneResolver?: DatafnTemporalTimezoneResolver;
  weekStartsOn?: number;
};

export type DatafnTemporalTimezoneResolver = (input: {
  instant: number;
  field: string;
  resource?: string;
  record?: Record<string, unknown>;
  scale?: DatafnTemporalScale;
}) => string | undefined;

export type DatafnResolvedTemporalGroup = {
  field: string;
  alias: string;
  scale: DatafnTemporalScale;
  timezone: string;
  timezoneResolver?: DatafnTemporalTimezoneResolver;
  resource?: string;
  storage: DatafnTemporalStorage;
  output: DatafnTemporalStorage;
  weekStartsOn: number;
};

export type DatafnTimezoneChangeRecord = {
  id: string;
  timezone: string;
  effectiveFrom: number;
  recordedAt: number;
  source?: string;
};

export const TIMEZONE_CHANGE_RESOURCE_NAME = "datafnTimezoneChange";
export const TIMEZONE_CHANGE_ID_PREFIX = "timezoneChange";

type TemporalQuery = Record<string, unknown> & {
  temporal?: DatafnTemporalClause | readonly DatafnTemporalClause[];
};

export function normalizeTemporalQuery<T extends Record<string, unknown>>(
  query: T,
  config: DatafnTemporalConfig = {},
): T {
  const clauses = getTemporalClauses(query);
  if (clauses.length === 0) {
    return query;
  }

  let filters = isRecord(query.filters) ? { ...query.filters } : undefined;
  const generatedFilters: Record<string, unknown>[] = [];
  const retainedClauses: DatafnTemporalClause[] = [];

  for (const clause of clauses) {
    const resolved = resolveTemporalClauseDefaults(clause, config);
    if (resolved.period || resolved.range) {
      const range = resolved.range
        ? {
            start: resolveTemporalInputMs(resolved.range.start, resolved.storage),
            end: resolveTemporalInputMs(resolved.range.end, resolved.storage),
          }
        : resolveTemporalPeriodRange(
            resolved.period ?? { scale: "day" },
            resolveTimezoneForInstant({
              timezone: resolved.timezone,
              config,
              instant: resolveTemporalInputMs(resolved.period?.at ?? Date.now(), resolved.storage),
              field: resolved.field,
              resource: typeof query.resource === "string" ? query.resource : undefined,
              scale: resolved.period?.scale,
            }),
            resolved.weekStartsOn,
          );

      generatedFilters.push({
        [resolved.field]: {
          $gte: toTemporalStorageValue(range.start, resolved.storage),
          $lte: toTemporalStorageValue(range.end, resolved.storage),
        },
      });
    }

    if (resolved.groupBy) {
      retainedClauses.push(resolved);
    }
  }

  if (generatedFilters.length > 0) {
    filters = mergeTemporalFilters(filters, generatedFilters);
  }

  const normalized: Record<string, unknown> = {
    ...query,
    ...(filters ? { filters } : {}),
  };

  if (retainedClauses.length > 0) {
    normalized.temporal =
      retainedClauses.length === 1 ? retainedClauses[0] : retainedClauses;
  } else {
    delete normalized.temporal;
  }

  return normalized as T;
}

export function getTemporalClauses(
  query: Partial<TemporalQuery>,
): DatafnTemporalClause[] {
  const temporal = query.temporal;
  if (!temporal) {
    return [];
  }
  if (Array.isArray(temporal)) {
    return temporal.filter(isTemporalClause);
  }
  return isTemporalClause(temporal) ? [temporal] : [];
}

export function hasTemporalGrouping(query: Partial<TemporalQuery>): boolean {
  return getTemporalGroups(query).length > 0;
}

export function getTemporalGroups(
  query: Partial<TemporalQuery>,
  config: DatafnTemporalConfig = {},
): DatafnResolvedTemporalGroup[] {
  return getTemporalClauses(query)
    .map((clause) => resolveTemporalClauseDefaults(clause, config))
    .filter((clause) => !!clause.groupBy)
    .map((clause) => ({
      field: clause.field,
      alias: clause.groupBy?.alias ?? `${clause.field}_${clause.groupBy?.scale}`,
      scale: clause.groupBy?.scale ?? "day",
      timezone: clause.timezone ?? resolveTemporalTimezone(config),
      timezoneResolver: config.timezoneResolver,
      resource: typeof query.resource === "string" ? query.resource : undefined,
      storage: clause.storage ?? "unix-ms",
      output: clause.groupBy?.output ?? "iso",
      weekStartsOn:
        clause.groupBy?.weekStartsOn ?? clause.weekStartsOn ?? config.weekStartsOn ?? 1,
    }));
}

export function getTemporalGroupAliases(
  query: Partial<TemporalQuery>,
): Set<string> {
  return new Set(getTemporalGroups(query).map((group) => group.alias));
}

export function resolveTemporalBucketValue(
  record: Record<string, unknown>,
  group: DatafnResolvedTemporalGroup,
): unknown {
  const value = resolvePath(record, group.field);
  if (value == null) {
    return null;
  }
  const ms = resolveTemporalInputMs(value as string | number | Date, group.storage);
  if (!Number.isFinite(ms)) {
    return null;
  }
  const timezone = resolveTimezoneForInstant({
    timezone: group.timezone,
    config: { timezoneResolver: group.timezoneResolver },
    instant: ms,
    field: group.field,
    resource: group.resource,
    record,
    scale: group.scale,
  });
  const start = startOfTemporalPeriod(
    ms,
    group.scale,
    timezone,
    group.weekStartsOn,
  );
  return toTemporalStorageValue(start, group.output);
}

export function resolveTemporalPeriodRange(
  period: DatafnTemporalPeriodInput,
  timezone = "UTC",
  weekStartsOn = 1,
): { start: number; end: number } {
  const at = resolveTemporalInputMs(period.at ?? Date.now(), "unix-ms");
  const start = startOfTemporalPeriod(at, period.scale, timezone, weekStartsOn);
  const next = addTemporalPeriod(start, period.scale, timezone);
  return { start, end: next - 1 };
}

export function resolveTemporalBucketKey(
  input: DatafnTemporalBucketInput,
  config: DatafnTemporalConfig = {},
): number | string | Date | null {
  const storage = input.storage ?? "unix-ms";
  const output = input.output ?? storage;
  const instant = resolveTemporalInputMs(input.value, storage);
  if (!Number.isFinite(instant)) {
    return null;
  }
  const timezone = resolveTimezoneForInstant({
    timezone: input.timezone,
    config,
    instant,
    field: input.field ?? "temporal",
    resource: input.resource,
    record: input.record,
    scale: input.scale,
  });
  const start = startOfTemporalPeriod(
    instant,
    input.scale,
    timezone,
    input.weekStartsOn ?? config.weekStartsOn ?? 1,
  );
  return toTemporalStorageValue(start, output);
}

export function startOfTemporalPeriod(
  value: string | number | Date,
  scale: DatafnTemporalScale,
  timezone = "UTC",
  weekStartsOn = 1,
): number {
  const instant = resolveTemporalInputMs(value, "unix-ms");
  if (!Number.isFinite(instant)) {
    return NaN;
  }
  const date = new Date(instant);
  const parts = getZonedParts(date, timezone);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;
  let hour = parts.hour;

  if (scale !== "hour") {
    hour = 0;
  }
  if (scale === "week") {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const delta = (dow - normalizeWeekStartsOn(weekStartsOn) + 7) % 7;
    const local = new Date(Date.UTC(year, month - 1, day - delta));
    year = local.getUTCFullYear();
    month = local.getUTCMonth() + 1;
    day = local.getUTCDate();
  } else if (scale === "month") {
    day = 1;
  } else if (scale === "quarter") {
    month = Math.floor((month - 1) / 3) * 3 + 1;
    day = 1;
  } else if (scale === "year") {
    month = 1;
    day = 1;
  }

  return zonedTimeToUtcMs({ year, month, day, hour, minute: 0, second: 0, millisecond: 0 }, timezone);
}

export function addTemporalPeriod(
  periodStartMs: number,
  scale: DatafnTemporalScale,
  timezone = "UTC",
): number {
  if (!Number.isFinite(periodStartMs)) {
    return NaN;
  }
  const parts = getZonedParts(new Date(periodStartMs), timezone);
  const local = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );

  if (scale === "hour") {
    local.setUTCHours(local.getUTCHours() + 1);
  } else if (scale === "day") {
    local.setUTCDate(local.getUTCDate() + 1);
  } else if (scale === "week") {
    local.setUTCDate(local.getUTCDate() + 7);
  } else if (scale === "month") {
    local.setUTCMonth(local.getUTCMonth() + 1);
  } else if (scale === "quarter") {
    local.setUTCMonth(local.getUTCMonth() + 3);
  } else if (scale === "year") {
    local.setUTCFullYear(local.getUTCFullYear() + 1);
  }

  return zonedTimeToUtcMs(
    {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
      hour: local.getUTCHours(),
      minute: local.getUTCMinutes(),
      second: local.getUTCSeconds(),
      millisecond: local.getUTCMilliseconds(),
    },
    timezone,
  );
}

/**
 * Resolves an instant to wall-clock date parts in a target timezone.
 */
export function resolveTemporalDateParts(
  value: string | number | Date,
  timezone = "UTC",
  storage: DatafnTemporalStorage = "unix-ms",
): DatafnTemporalDateParts {
  const instant = resolveTemporalInputMs(value, storage);
  if (!Number.isFinite(instant)) {
    return invalidTemporalDateParts();
  }
  return getZonedParts(new Date(instant), timezone);
}

export function resolveTemporalLocalTime(
  input: DatafnTemporalLocalTimeInput,
  timezone = "UTC",
): number {
  return zonedTimeToUtcMs(
    {
      year: input.year,
      month: input.month,
      day: input.day,
      hour: input.hour ?? 0,
      minute: input.minute ?? 0,
      second: input.second ?? 0,
      millisecond: input.millisecond ?? 0,
    },
    timezone,
  );
}

export function toTemporalStorageValue(
  ms: number,
  storage: DatafnTemporalStorage = "unix-ms",
): number | string | Date {
  if (storage === "unix-s") {
    return Math.floor(ms / 1000);
  }
  if (storage === "date") {
    return new Date(ms);
  }
  if (storage === "iso") {
    return new Date(ms).toISOString();
  }
  return ms;
}

export function resolveTemporalInputMs(
  value: string | number | Date,
  storage: DatafnTemporalStorage = "unix-ms",
): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return storage === "unix-s" ? value * 1000 : value;
  }
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return storage === "unix-s" ? numeric * 1000 : numeric;
  }
  return Date.parse(value);
}

export const time = {
  range(
    field: string,
    range: DatafnTemporalRangeInput,
    options: Omit<DatafnTemporalClause, "field" | "range"> = {},
  ): DatafnTemporalClause {
    return { field, ...options, range };
  },
  between(
    field: string,
    start: string | number | Date,
    end: string | number | Date,
    options: Omit<DatafnTemporalClause, "field" | "range"> = {},
  ): DatafnTemporalClause {
    return { field, ...options, range: { start, end } };
  },
  period(
    field: string,
    period: DatafnTemporalPeriodInput,
    options: Omit<DatafnTemporalClause, "field" | "period"> = {},
  ): DatafnTemporalClause {
    return { field, ...options, period };
  },
  group(
    field: string,
    scale: DatafnTemporalScale,
    options: Omit<DatafnTemporalClause, "field" | "groupBy"> & {
      alias?: string;
      output?: DatafnTemporalStorage;
    } = {},
  ): DatafnTemporalClause {
    const { alias, output, ...rest } = options;
    return { field, ...rest, groupBy: { scale, alias, output } };
  },
  hour(field: string, at?: string | number | Date, options: TemporalHelperOptions = {}) {
    return periodHelper(field, "hour", at, options);
  },
  day(field: string, at?: string | number | Date, options: TemporalHelperOptions = {}) {
    return periodHelper(field, "day", at, options);
  },
  week(field: string, at?: string | number | Date, options: TemporalHelperOptions = {}) {
    return periodHelper(field, "week", at, options);
  },
  month(field: string, at?: string | number | Date, options: TemporalHelperOptions = {}) {
    return periodHelper(field, "month", at, options);
  },
  quarter(field: string, at?: string | number | Date, options: TemporalHelperOptions = {}) {
    return periodHelper(field, "quarter", at, options);
  },
  year(field: string, at?: string | number | Date, options: TemporalHelperOptions = {}) {
    return periodHelper(field, "year", at, options);
  },
  groupByHour(field: string, options: TemporalGroupHelperOptions = {}) {
    return groupHelper(field, "hour", options);
  },
  groupByDay(field: string, options: TemporalGroupHelperOptions = {}) {
    return groupHelper(field, "day", options);
  },
  groupByWeek(field: string, options: TemporalGroupHelperOptions = {}) {
    return groupHelper(field, "week", options);
  },
  groupByMonth(field: string, options: TemporalGroupHelperOptions = {}) {
    return groupHelper(field, "month", options);
  },
  groupByQuarter(field: string, options: TemporalGroupHelperOptions = {}) {
    return groupHelper(field, "quarter", options);
  },
  groupByYear(field: string, options: TemporalGroupHelperOptions = {}) {
    return groupHelper(field, "year", options);
  },
};

export const temporal = time;

export function createTimezoneResolver(
  records: readonly Partial<DatafnTimezoneChangeRecord>[],
  options: { defaultTimezone?: string | (() => string | undefined) } = {},
): DatafnTemporalTimezoneResolver {
  const sorted = records
    .filter(
      (record): record is DatafnTimezoneChangeRecord =>
        typeof record.timezone === "string" &&
        typeof record.effectiveFrom === "number" &&
        Number.isFinite(record.effectiveFrom),
    )
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom);

  return ({ instant }) => {
    let resolved: string | undefined;
    for (const record of sorted) {
      if (record.effectiveFrom <= instant) {
        resolved = record.timezone;
      } else {
        break;
      }
    }
    return resolved ?? resolveDefaultTimezone(options.defaultTimezone);
  };
}

export function timezoneChangeId(
  effectiveFrom: number,
  timezone: string,
  suffix = "",
): string {
  const safeTimezone = timezone.replace(/[^A-Za-z0-9_-]/g, "_");
  const safeSuffix = suffix ? `:${suffix.replace(/[^A-Za-z0-9_-]/g, "_")}` : "";
  return `${TIMEZONE_CHANGE_ID_PREFIX}:${effectiveFrom}:${safeTimezone}${safeSuffix}`;
}

export function ensureBuiltinTemporal(schema: DatafnSchema): DatafnSchema {
  const existing = schema.resources.find(
    (resource) => resource.name === TIMEZONE_CHANGE_RESOURCE_NAME,
  );

  if (existing) {
    validateBuiltinTimezoneChange(existing);
    return schema;
  }

  return {
    ...schema,
    resources: [...schema.resources, createBuiltinTimezoneChangeResource()],
  };
}

export function createTemporalPlugin(
  config: DatafnTemporalConfig = {},
): DatafnPlugin {
  return {
    name: "datafn-temporal",
    runsOn: ["client", "server"],
    beforeQuery(_ctx, query) {
      if (Array.isArray(query)) {
        return query.map((entry) =>
          isRecord(entry) ? normalizeTemporalQuery(entry, config) : entry,
        );
      }
      return isRecord(query) ? normalizeTemporalQuery(query, config) : query;
    },
  };
}

function createBuiltinTimezoneChangeResource(): DatafnResourceSchema {
  return {
    name: TIMEZONE_CHANGE_RESOURCE_NAME,
    version: 1,
    idPrefix: TIMEZONE_CHANGE_ID_PREFIX,
    fields: [
      { name: "id", type: "string", required: true },
      { name: "timezone", type: "string", required: true },
      { name: "effectiveFrom", type: "number", required: true },
      { name: "recordedAt", type: "number", required: true },
      { name: "source", type: "string", required: false },
    ],
    indices: ["id", "effectiveFrom", "timezone"],
    permissions: {
      read: { fields: ["id", "timezone", "effectiveFrom", "recordedAt", "source"] },
      write: { fields: ["id", "timezone", "effectiveFrom", "recordedAt", "source"] },
    },
  };
}

function validateBuiltinTimezoneChange(resource: DatafnResourceSchema): void {
  if (resource.version !== 1) {
    throw new Error(
      `Timezone registry resource version mismatch: expected 1, got ${resource.version}`,
    );
  }

  const fields = new Map(resource.fields.map((field) => [field.name, field]));
  const required = [
    ["id", "string", true],
    ["timezone", "string", true],
    ["effectiveFrom", "number", true],
    ["recordedAt", "number", true],
    ["source", "string", false],
  ] as const;

  for (const [name, type, isRequired] of required) {
    const field = fields.get(name);
    if (!field) {
      throw new Error(`Timezone registry resource is missing required field "${name}"`);
    }
    if (field.type !== type || field.required !== isRequired) {
      throw new Error(
        `Timezone registry field "${name}" is incompatible with the built-in temporal schema`,
      );
    }
  }
}

type TemporalHelperOptions = Omit<DatafnTemporalClause, "field" | "period">;
type TemporalGroupHelperOptions = Omit<DatafnTemporalClause, "field" | "groupBy"> & {
  alias?: string;
  output?: DatafnTemporalStorage;
};

function periodHelper(
  field: string,
  scale: DatafnTemporalScale,
  at: string | number | Date | undefined,
  options: TemporalHelperOptions,
): DatafnTemporalClause {
  return { field, ...options, period: { scale, ...(at !== undefined ? { at } : {}) } };
}

function groupHelper(
  field: string,
  scale: DatafnTemporalScale,
  options: TemporalGroupHelperOptions,
): DatafnTemporalClause {
  const { alias, output, ...rest } = options;
  return { field, ...rest, groupBy: { scale, alias, output } };
}

function resolveTemporalClauseDefaults(
  clause: DatafnTemporalClause,
  config: DatafnTemporalConfig,
): DatafnTemporalClause {
  return {
    ...clause,
    timezone: clause.timezone ?? resolveTemporalTimezone(config),
    storage: clause.storage ?? "unix-ms",
    weekStartsOn: clause.weekStartsOn ?? config.weekStartsOn ?? 1,
  };
}

function resolveTemporalTimezone(config: DatafnTemporalConfig): string {
  const timezone =
    typeof config.timezone === "function" ? config.timezone() : config.timezone;
  return timezone || "UTC";
}

function resolveTimezoneForInstant(input: {
  timezone: string | undefined;
  config: DatafnTemporalConfig;
  instant: number;
  field: string;
  resource?: string;
  record?: Record<string, unknown>;
  scale?: DatafnTemporalScale;
}): string {
  if (input.timezone && input.timezone !== "user") {
    return input.timezone;
  }
  const resolved = input.config.timezoneResolver?.({
    instant: input.instant,
    field: input.field,
    resource: input.resource,
    record: input.record,
    scale: input.scale,
  });
  return resolved || resolveTemporalTimezone(input.config);
}

function resolveDefaultTimezone(
  timezone: string | (() => string | undefined) | undefined,
): string | undefined {
  return typeof timezone === "function" ? timezone() : timezone;
}

function mergeTemporalFilters(
  filters: Record<string, unknown> | undefined,
  generated: Record<string, unknown>[],
): Record<string, unknown> {
  if (!filters || Object.keys(filters).length === 0) {
    return generated.length === 1 ? generated[0] : { $and: generated };
  }
  return { $and: [filters, ...generated] };
}

function getZonedParts(date: Date, timezone: string): DatafnTemporalDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  let hour = values.hour ?? 0;
  if (hour === 24) {
    hour = 0;
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
    millisecond: date.getUTCMilliseconds(),
  };
}

function invalidTemporalDateParts(): DatafnTemporalDateParts {
  return {
    year: NaN,
    month: NaN,
    day: NaN,
    hour: NaN,
    minute: NaN,
    second: NaN,
    millisecond: NaN,
  };
}

function zonedTimeToUtcMs(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
  },
  timezone: string,
): number {
  if (!Object.values(parts).every(Number.isFinite)) {
    return NaN;
  }
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  if (!Number.isFinite(utcGuess)) {
    return NaN;
  }
  const first = utcGuess - getTimezoneOffsetMs(new Date(utcGuess), timezone);
  if (!Number.isFinite(first)) {
    return NaN;
  }
  return utcGuess - getTimezoneOffsetMs(new Date(first), timezone);
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  if (!Number.isFinite(date.getTime())) {
    return NaN;
  }
  const parts = getZonedParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  return asUtc - date.getTime();
}

function resolvePath(record: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) {
    return record[path];
  }
  let current: unknown = record;
  for (const part of path.split(".")) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function normalizeWeekStartsOn(value: number): number {
  if (!Number.isInteger(value)) {
    return 1;
  }
  return ((value % 7) + 7) % 7;
}

function isTemporalClause(value: unknown): value is DatafnTemporalClause {
  return isRecord(value) && typeof value.field === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
