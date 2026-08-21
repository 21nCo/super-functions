import { createUIFnError } from '../../errors';

const OBJECT_TAG = '[object Object]';

function nonSerializable(path: string, value: unknown): never {
  throw createUIFnError({
    code: 'UIFN_SNAPSHOT_NON_SERIALIZABLE',
    package: '@uifn/core',
    component: 'Runtime',
    message: 'Runtime snapshots may contain only deterministic JSON-compatible values.',
    details: {
      path,
      valueType: value === null ? 'null' : typeof value,
      valueTag: value && typeof value === 'object' ? Object.prototype.toString.call(value) : undefined,
    },
  });
}

export function cloneSerializable<T>(value: T, path = '$', seen = new WeakSet<object>()): T {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) nonSerializable(path, value);
    return value;
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return nonSerializable(path, value);
  }
  if (typeof value !== 'object') return nonSerializable(path, value);
  if (seen.has(value)) return nonSerializable(path, value);
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((entry, index) => cloneSerializable(entry, `${path}[${index}]`, seen));
    seen.delete(value);
    return result as T;
  }

  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    let serialized: unknown;
    try {
      serialized = (toJSON as () => unknown).call(value);
    } catch {
      return nonSerializable(path, value);
    }
    seen.delete(value);
    return cloneSerializable(serialized, path, seen) as T;
  }

  if (Object.prototype.toString.call(value) !== OBJECT_TAG || Object.getPrototypeOf(value) === null) {
    return nonSerializable(path, value);
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    // Match JSON object semantics while keeping undefined out of snapshots.
    if (entry !== undefined) result[key] = cloneSerializable(entry, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return result as T;
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (!value || typeof value !== 'object' || seen.has(value)) return value as Readonly<T>;
  seen.add(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry, seen);
  return Object.freeze(value);
}

export function immutableSerializable<T>(value: T, path = '$'): Readonly<T> {
  return deepFreeze(cloneSerializable(value, path));
}

export function structuralEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => structuralEqual(entry, right[index]));
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left as Record<string, unknown>).sort();
  const rightKeys = Object.keys(right as Record<string, unknown>).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every((key) => structuralEqual(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
  ));
}

export function changedObjectKeys(prefix: string, previous: unknown, next: unknown): string[] {
  if (structuralEqual(previous, next)) return [];
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || Array.isArray(previous) || Array.isArray(next)) {
    return [prefix];
  }
  const keys = new Set([
    ...Object.keys(previous as Record<string, unknown>),
    ...Object.keys(next as Record<string, unknown>),
  ]);
  const changed = [...keys].sort().filter((key) => !structuralEqual(
    (previous as Record<string, unknown>)[key],
    (next as Record<string, unknown>)[key],
  ));
  return changed.length > 0 ? changed.map((key) => `${prefix}.${key}`) : [prefix];
}
