/**
 * Simple runtime validation helpers for records against a TableSchema.
 * These are intentionally lightweight and not a replacement for Zod/Valibot.
 */
import type { TableSchema, ValidationResult } from '../adapter/types.js';

function validateField(fieldKey: string, field: any, value: unknown): string | null {
  if (value == null) {
    if (field.required) return `Field ${fieldKey} is required`;
    return null;
  }
  switch (field.type) {
    case 'string':
      return typeof value === 'string' ? null : `Field ${fieldKey} must be a string`;
    case 'number':
      return typeof value === 'number' ? null : `Field ${fieldKey} must be a number`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `Field ${fieldKey} must be a boolean`;
    case 'date':
    case 'datetime':
      return validateDateField(fieldKey, field, value);
    case 'json':
      try { JSON.stringify(value); return null; } catch { return `Field ${fieldKey} must be JSON-serializable`; }
    case 'bigint':
      return typeof value === 'bigint' || typeof value === 'number' ? null : `Field ${fieldKey} must be bigint or number`;
    default:
      return null;
  }
}

function validateDateField(fieldKey: string, field: any, value: unknown): string | null {
  switch (field.dateValueType ?? 'date') {
    case 'date':
      return isValidDateInput(value)
        ? null
        : `Field ${fieldKey} must be a Date, ISO string, or epoch milliseconds`;
    case 'iso-string':
      return typeof value === 'string' && isValidDateInput(value)
        ? null
        : `Field ${fieldKey} must be an ISO date string`;
    case 'epoch-ms':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `Field ${fieldKey} must be epoch milliseconds`;
    default:
      return null;
  }
}

function isValidDateInput(value: unknown): boolean {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return Number.isFinite(new Date(value).getTime());
  }
  return false;
}

export function validateRecordAgainstSchema(schema: TableSchema, record: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  for (const [key, field] of Object.entries(schema.fields)) {
    const v = (record as any)[key];
    const err = validateField(key, field, v);
    if (err) errors.push(err);
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
