/**
 * Shared date conversion utilities (DTE-001, DTE-002)
 */

import type { DatafnFieldSchema } from "./types.js";
import { isDatafnE2eeEnvelope } from "./e2ee.js";

function dfqlInvalid(msg: string): never {
  throw { code: "DFQL_INVALID", message: msg };
}

function assertFiniteEpoch(value: number): void {
  if (!Number.isFinite(value)) {
    dfqlInvalid(`Invalid epoch milliseconds: ${String(value)}`);
  }
}

/**
 * Convert a Date, ISO string, or epoch number to epoch milliseconds.
 * Idempotent: if already a number, returns it directly.
 */
export function toEpochMs(value: unknown): number {
  if (typeof value === "number") {
    assertFiniteEpoch(value);
    return value;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    assertFiniteEpoch(ms);
    return ms;
  }
  if (typeof value === "string") {
    const ms = new Date(value).getTime();
    assertFiniteEpoch(ms);
    return ms;
  }
  dfqlInvalid(`Cannot convert to epoch ms: ${String(value)}`);
}

/**
 * Convert an epoch number, ISO string, or Date to a Date object.
 * Idempotent: if already a Date, returns it directly.
 */
export function fromEpochMs(value: unknown): Date {
  if (value instanceof Date) {
    assertFiniteEpoch(value.getTime());
    return value;
  }
  if (typeof value === "number") {
    assertFiniteEpoch(value);
    return new Date(value);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    assertFiniteEpoch(d.getTime());
    return d;
  }
  dfqlInvalid(`Cannot convert to Date: ${String(value)}`);
}

type FieldLike = Pick<DatafnFieldSchema, "name" | "type">;

/**
 * Mutate record in place: convert date-typed fields to epoch milliseconds.
 *
 * LOW-024: This function intentionally mutates the record in-place and returns it
 * (callers rely on the mutation side-effect, as verified by existing tests).
 * If a non-mutating variant is needed, create a separate helper that copies first.
 */
export function coerceDateFieldsToEpoch(
  record: Record<string, unknown>,
  fields: readonly FieldLike[],
): Record<string, unknown> {
  for (const field of fields) {
    if (field.type !== "date") continue;
    const val = record[field.name];
    if (val === null || val === undefined) continue;
    if (isDatafnE2eeEnvelope(val)) continue;
    record[field.name] = toEpochMs(val);
  }
  return record;
}

/**
 * Mutate record in place: convert date-typed fields to Date objects.
 *
 * LOW-024: This function intentionally mutates the record in-place and returns it
 * (callers rely on the mutation side-effect, as verified by existing tests).
 * If a non-mutating variant is needed, create a separate helper that copies first.
 */
export function parseDateFieldsToDate(
  record: Record<string, unknown>,
  fields: readonly FieldLike[],
): Record<string, unknown> {
  for (const field of fields) {
    if (field.type !== "date") continue;
    const val = record[field.name];
    if (val === null || val === undefined) continue;
    if (isDatafnE2eeEnvelope(val)) continue;
    record[field.name] = fromEpochMs(val);
  }
  return record;
}
