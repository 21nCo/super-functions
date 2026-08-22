import { createHash } from "node:crypto";

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalizeValue(value: unknown, key: string, applyToJSON: boolean): unknown {
  if (applyToJSON && value && typeof value === "object" && "toJSON" in value) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") {
      return canonicalizeValue(toJSON.call(value, key), key, false);
    }
  }
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) => canonicalizeValue(value[index], String(index), true));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([property, entry]) => [property, canonicalizeValue(entry, property, true)]),
    );
  }
  return value;
}

export function canonicalize(value: unknown): unknown {
  return canonicalizeValue(value, "", true);
}

export function canonicalJson(value: unknown): string {
  const seen = new Set<object>();
  const serialize = (entry: unknown, key: string, applyToJSON = true): string | undefined => {
    if (applyToJSON && entry && typeof entry === "object" && "toJSON" in entry) {
      const toJSON = (entry as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === "function") return serialize(toJSON.call(entry, key), key, false);
    }
    if (entry === null || typeof entry !== "object") return JSON.stringify(entry);
    if (seen.has(entry)) throw new TypeError("Cannot canonicalize a circular value.");
    seen.add(entry);
    try {
      if (Array.isArray(entry)) {
        const items = Array.from({ length: entry.length }, (_, index) => serialize(entry[index], String(index)) ?? "null");
        return `[${items.join(",")}]`;
      }
      const properties = Object.entries(entry as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .flatMap(([key, item]) => {
          const serialized = serialize(item, key);
          return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
        });
      return `{${properties.join(",")}}`;
    } finally {
      seen.delete(entry);
    }
  };
  const serialized = serialize(value, "");
  return serialized as string;
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
