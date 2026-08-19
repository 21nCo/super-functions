/**
 * Shared storage adapter validation utilities (STR-001)
 */

import type { DatafnHydrationState } from "../storage.js";

export function validateHydrationState(state: string): DatafnHydrationState {
  if (state !== "notStarted" && state !== "hydrating" && state !== "ready") {
    throw new Error(`Invalid hydration state: ${state}`);
  }
  return state as DatafnHydrationState;
}

export function validateTransition(
  from: DatafnHydrationState,
  to: DatafnHydrationState,
): void {
  if (from === to) return;
  if (from === "notStarted" && to === "hydrating") return;
  if (from === "hydrating" && to === "ready") return;
  if (from === "ready" && to === "hydrating") return;
  throw new Error(`Invalid hydration state transition: ${from} -> ${to}`);
}

export function validateCursor(cursor: unknown): void {
  if (cursor !== null && typeof cursor !== "string") {
    throw new Error("Invalid cursor format");
  }
}

export function cloneForStorage<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }

  if (ArrayBuffer.isView(value)) {
    return value;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const existing = seen.get(source);
  if (existing) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(source, output);
    for (const item of value) {
      output.push(cloneForStorage(item, seen));
    }
    return output as T;
  }

  const output: Record<string, unknown> = {};
  seen.set(source, output);
  for (const key of Object.keys(source)) {
    const child = source[key];
    if (typeof child === "function" || typeof child === "symbol") {
      continue;
    }
    output[key] = cloneForStorage(child, seen);
  }
  return output as T;
}
