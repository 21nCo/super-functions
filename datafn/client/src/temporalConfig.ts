import {
  createTimezoneResolver,
  type DatafnTemporalConfig,
  type DatafnTimezoneChangeRecord,
} from "@datafn/core";

export type DatafnClientTemporalConfig = DatafnTemporalConfig & {
  detectTimezone?: () => string | undefined;
};

export function createClientTemporalConfig(
  temporal: DatafnClientTemporalConfig | undefined,
  timezoneChanges: readonly Partial<DatafnTimezoneChangeRecord>[] = [],
): DatafnTemporalConfig {
  const registryTimezoneResolver = createTimezoneResolver(timezoneChanges, {
    defaultTimezone: () => resolveTemporalFallbackTimezone(temporal),
  });

  return {
    ...temporal,
    timezoneResolver: (input) => {
      const configuredTimezone = normalizeUserTimezoneAlias(
        temporal?.timezoneResolver?.(input),
      );
      return (
        registryTimezoneResolver(input) ??
        configuredTimezone ??
        resolveConfiguredTimezone(temporal) ??
        resolveDetectedTimezone(temporal) ??
        "UTC"
      );
    },
  };
}

function resolveTemporalFallbackTimezone(
  temporal: DatafnClientTemporalConfig | undefined,
): string | undefined {
  return (
    resolveDetectedTimezone(temporal) ??
    resolveConfiguredTimezone(temporal) ??
    "UTC"
  );
}

function resolveConfiguredTimezone(
  temporal: DatafnClientTemporalConfig | undefined,
): string | undefined {
  const timezone =
    typeof temporal?.timezone === "function"
      ? temporal.timezone()
      : temporal?.timezone;
  return normalizeUserTimezoneAlias(timezone);
}

function resolveDetectedTimezone(
  temporal: DatafnClientTemporalConfig | undefined,
): string | undefined {
  const detected = temporal?.detectTimezone?.();
  if (detected) return detected;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function normalizeUserTimezoneAlias(timezone: string | undefined): string | undefined {
  return timezone && timezone !== "user" ? timezone : undefined;
}
