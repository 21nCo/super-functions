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
