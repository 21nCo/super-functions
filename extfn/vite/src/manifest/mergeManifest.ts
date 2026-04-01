export function mergeManifest(
  ...parts: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const merged = parts.reduce<Record<string, unknown>>((accumulator, part) => {
    if (!part) {
      return accumulator;
    }

    return deepMerge(accumulator, part);
  }, {});

  return sortManifestKeys(merged) as Record<string, unknown>;
}

function deepMerge(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    const currentValue = result[key];

    if (isPlainObject(currentValue) && isPlainObject(value)) {
      result[key] = deepMerge(currentValue, value);
      continue;
    }

    result[key] = cloneValue(value);
  }

  return result;
}

function sortManifestKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortManifestKeys(entry));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortManifestKeys(value[key])])
  );
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (isPlainObject(value)) {
    return deepMerge({}, value);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
