import { createHash } from "node:crypto";

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalize(value: unknown): unknown {
  if (value && typeof value === "object" && "toJSON" in value) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") {
      return canonicalize(toJSON.call(value));
    }
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const seen = new Set<object>();
  const serialize = (entry: unknown): string | undefined => {
    if (entry && typeof entry === "object" && "toJSON" in entry) {
      const toJSON = (entry as { toJSON?: unknown }).toJSON;
      if (typeof toJSON === "function") return serialize(toJSON.call(entry));
    }
    if (entry === null || typeof entry !== "object") return JSON.stringify(entry);
    if (seen.has(entry)) throw new TypeError("Cannot canonicalize a circular value.");
    seen.add(entry);
    try {
      if (Array.isArray(entry)) {
        return `[${entry.map((item) => serialize(item) ?? "null").join(",")}]`;
      }
      const properties = Object.entries(entry as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .flatMap(([key, item]) => {
          const serialized = serialize(item);
          return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
        });
      return `{${properties.join(",")}}`;
    } finally {
      seen.delete(entry);
    }
  };
  const serialized = serialize(value);
  return serialized as string;
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
