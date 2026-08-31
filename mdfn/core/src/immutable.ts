import type { MdfnDocument } from "./types";

function detachAndDeepFreeze<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing) return existing as T;

  if (Array.isArray(value)) {
    const detached: unknown[] = [];
    seen.set(value, detached);
    for (const entry of value) detached.push(detachAndDeepFreeze(entry, seen));
    return Object.freeze(detached) as T;
  }

  const detached: Record<string, unknown> = {};
  seen.set(value, detached);
  for (const [key, entry] of Object.entries(value)) {
    detached[key] = detachAndDeepFreeze(entry, seen);
  }
  return Object.freeze(detached) as T;
}

export function immutableValue<T>(value: T): T {
  return detachAndDeepFreeze(value, new WeakMap<object, unknown>());
}

export function immutableDocument(document: MdfnDocument): MdfnDocument {
  return immutableValue(document);
}
