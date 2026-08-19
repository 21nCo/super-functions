import {
  TIMEZONE_CHANGE_RESOURCE_NAME,
  createTimezoneResolver,
  resolveTemporalBucketKey,
  resolveTemporalLocalTime,
  resolveTemporalPeriodRange,
  time,
  timezoneChangeId,
  type DatafnTemporalBucketInput,
  type DatafnTemporalPeriodInput,
  type DatafnTimezoneChangeRecord,
} from "@datafn/core";
import type { DatafnStorageAdapter } from "./storage.js";
import type { DatafnTable } from "./tables/table.js";

export type DatafnTemporalChangeSource = "manual" | "browser" | "system" | "import" | string;

export type RecordTimezoneChangeInput = {
  timezone: string;
  effectiveFrom?: number | string | Date;
  recordedAt?: number | string | Date;
  source?: DatafnTemporalChangeSource;
};

export interface DatafnTemporalApi {
  detectTimezone(): string | undefined;
  listTimezoneChanges(): Promise<DatafnTimezoneChangeRecord[]>;
  currentTimezone(instant?: number | string | Date): Promise<string>;
  resolveTimezone(instant?: number | string | Date): Promise<string>;
  recordTimezoneChange(
    input: RecordTimezoneChangeInput,
  ): Promise<{ ok: true; record: DatafnTimezoneChangeRecord } | { ok: false; error: unknown }>;
  setTimezone(
    timezone: string,
    options?: Omit<RecordTimezoneChangeInput, "timezone">,
  ): Promise<{ ok: true; changed: boolean; record?: DatafnTimezoneChangeRecord } | { ok: false; error: unknown }>;
  resolveRange(
    period: DatafnTemporalPeriodInput,
    options?: { timezone?: string; instant?: number | string | Date },
  ): Promise<{ start: number; end: number; timezone: string }>;
  resolveRangeSync(
    period: DatafnTemporalPeriodInput,
    options?: { timezone?: string; instant?: number | string | Date },
  ): { start: number; end: number; timezone: string };
  resolveBucket(
    input: DatafnTemporalBucketInput,
  ): Promise<number | string | Date | null>;
  resolveBucketSync(
    input: DatafnTemporalBucketInput,
  ): number | string | Date | null;
  resolveLocalTime(
    value: number | string | Date,
    options?: { timezone?: string; instant?: number | string | Date },
  ): Promise<number>;
  resolveLocalTimeSync(
    value: number | string | Date,
    options?: { timezone?: string; instant?: number | string | Date },
  ): number;
}

export interface TemporalApiDeps {
  storage?: DatafnStorageAdapter;
  temporalTable: DatafnTable;
  clientId: string;
  getTimestamp: () => number;
  defaultTimezone?: string | (() => string | undefined);
  detectTimezone?: () => string | undefined;
}

export function createTemporalApi(deps: TemporalApiDeps): DatafnTemporalApi {
  let cachedChanges: DatafnTimezoneChangeRecord[] = [];

  const detectTimezone =
    deps.detectTimezone ??
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return undefined;
      }
    });

  const toMs = (value: number | string | Date | undefined): number => {
    if (value === undefined) return deps.getTimestamp();
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    return Date.parse(value);
  };

  const fallbackTimezone = (): string =>
    detectTimezone() ??
    (typeof deps.defaultTimezone === "function"
      ? deps.defaultTimezone()
      : deps.defaultTimezone) ??
    "UTC";

  const loadChanges = async (): Promise<DatafnTimezoneChangeRecord[]> => {
    let changes: DatafnTimezoneChangeRecord[];
    if (deps.storage) {
      const records = await deps.storage.listRecords(TIMEZONE_CHANGE_RESOURCE_NAME);
      changes = normalizeChanges(records);
    } else {
      const result = (await deps.temporalTable.query({
        select: ["id", "timezone", "effectiveFrom", "recordedAt", "source"],
        sort: ["effectiveFrom:asc"],
      } as any)) as { data?: Record<string, unknown>[] };
      changes = normalizeChanges(result.data ?? []);
    }
    cachedChanges = changes;
    return changes;
  };

  const resolverForChanges = (changes: readonly DatafnTimezoneChangeRecord[]) =>
    createTimezoneResolver(changes, {
      defaultTimezone: fallbackTimezone,
    });

  const resolveTimezoneFromChanges = (
    changes: readonly DatafnTimezoneChangeRecord[],
    instant?: number | string | Date,
  ) =>
    resolverForChanges(changes)({
      instant: toMs(instant),
      field: "effectiveFrom",
      resource: TIMEZONE_CHANGE_RESOURCE_NAME,
    }) ?? fallbackTimezone();

  const resolveRangeWithChanges = (
    changes: readonly DatafnTimezoneChangeRecord[],
    period: DatafnTemporalPeriodInput,
    options?: { timezone?: string; instant?: number | string | Date },
  ) => {
    const timezone = options?.timezone && options.timezone !== "user"
      ? options.timezone
      : resolveTimezoneFromChanges(changes, options?.instant ?? period.at);
    const range = resolveTemporalPeriodRange(period, timezone);
    return { ...range, timezone };
  };

  const resolveBucketWithChanges = (
    changes: readonly DatafnTimezoneChangeRecord[],
    input: DatafnTemporalBucketInput,
  ) =>
    resolveTemporalBucketKey(input, {
      timezone: fallbackTimezone,
      timezoneResolver: resolverForChanges(changes),
    });

  const dateParts = (value: number | string | Date) => {
    const date = new Date(toMs(value));
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
    };
  };

  const resolveLocalTimeWithChanges = (
    changes: readonly DatafnTimezoneChangeRecord[],
    value: number | string | Date,
    options?: { timezone?: string; instant?: number | string | Date },
  ) => {
    const instant = options?.instant ?? value;
    const timezone = options?.timezone && options.timezone !== "user"
      ? options.timezone
      : resolveTimezoneFromChanges(changes, instant);
    return resolveTemporalLocalTime(dateParts(value), timezone);
  };

  return {
    detectTimezone,

    async listTimezoneChanges(): Promise<DatafnTimezoneChangeRecord[]> {
      return loadChanges();
    },

    async currentTimezone(instant?: number | string | Date): Promise<string> {
      return this.resolveTimezone(instant);
    },

    async resolveTimezone(instant?: number | string | Date): Promise<string> {
      return resolveTimezoneFromChanges(await loadChanges(), instant);
    },

    async recordTimezoneChange(input: RecordTimezoneChangeInput) {
      if (!input.timezone || typeof input.timezone !== "string") {
        return {
          ok: false as const,
          error: {
            code: "DFQL_INVALID",
            message: "Timezone must be a non-empty string",
            details: { path: "timezone" },
          },
        };
      }

      const effectiveFrom = toMs(input.effectiveFrom);
      const recordedAt = toMs(input.recordedAt);
      const record: DatafnTimezoneChangeRecord = {
        id: timezoneChangeId(
          effectiveFrom,
          input.timezone,
          `${recordedAt}:${deps.clientId}`,
        ),
        timezone: input.timezone,
        effectiveFrom,
        recordedAt,
        source: input.source ?? "manual",
      };

      try {
        const result = (await deps.temporalTable.mutate({
          operation: "insert",
          id: record.id,
          record,
          clientId: deps.clientId,
          mutationId: `temporal-tz-${recordedAt}-${Math.random().toString(36).slice(2)}`,
          context: "temporal_timezone_change",
        } as any)) as any;

        if (result && typeof result === "object" && "ok" in result && !result.ok) {
          return { ok: false as const, error: result };
        }

        return { ok: true as const, record };
      } catch (error) {
        return { ok: false as const, error };
      }
    },

    async setTimezone(timezone: string, options?: Omit<RecordTimezoneChangeInput, "timezone">) {
      const effectiveFrom = toMs(options?.effectiveFrom);
      const existing = await this.resolveTimezone(effectiveFrom);
      if (existing === timezone) {
        return { ok: true as const, changed: false };
      }

      const result = await this.recordTimezoneChange({
        timezone,
        effectiveFrom,
        recordedAt: options?.recordedAt,
        source: options?.source ?? "manual",
      });

      if (!result.ok) {
        return result;
      }

      return { ok: true as const, changed: true, record: result.record };
    },

    async resolveRange(period, options) {
      return resolveRangeWithChanges(await loadChanges(), period, options);
    },

    resolveRangeSync(period, options) {
      return resolveRangeWithChanges(cachedChanges, period, options);
    },

    async resolveBucket(input) {
      return resolveBucketWithChanges(await loadChanges(), input);
    },

    resolveBucketSync(input) {
      return resolveBucketWithChanges(cachedChanges, input);
    },

    async resolveLocalTime(value, options) {
      return resolveLocalTimeWithChanges(await loadChanges(), value, options);
    },

    resolveLocalTimeSync(value, options) {
      return resolveLocalTimeWithChanges(cachedChanges, value, options);
    },
  };
}

export { time };

function normalizeChanges(records: readonly Record<string, unknown>[]): DatafnTimezoneChangeRecord[] {
  return records
    .filter((record): record is DatafnTimezoneChangeRecord =>
      typeof record.id === "string" &&
      typeof record.timezone === "string" &&
      typeof record.effectiveFrom === "number" &&
      typeof record.recordedAt === "number",
    )
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
}
