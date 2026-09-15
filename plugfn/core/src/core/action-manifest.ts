import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Action, ActionContract } from '../types/action.js';
import { redactTelemetry } from '../security/redaction.js';

export const actionContractSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    effect: z.enum(['read', 'write', 'destructive', 'unknown']),
    requiredScopes: z.array(z.string().min(1)),
    resources: z.array(
      z.object({ kind: z.string().min(1), parameter: z.string().min(1).optional() }).strict()
    ),
    sensitiveKeys: z.array(z.string().min(1)),
    pagination: z
      .object({
        kind: z.enum(['none', 'cursor', 'offset', 'page']),
        maxPageSize: z.number().int().positive().optional(),
        cursorParameter: z.string().min(1).optional(),
      })
      .strict(),
    retry: z.enum(['never', 'safe', 'provider-key']),
    idempotencyKeyParameter: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.retry === 'provider-key' && !value.idempotencyKeyParameter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provider-key retries require a key parameter',
      });
    }
    if (value.effect === 'unknown' && value.retry !== 'never') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unknown effects cannot opt into retries',
      });
    }
  });

export function resolveActionContract(action: Action): ActionContract {
  return actionContractSchema.parse(
    action.contract ?? {
      version: '0.0.0',
      effect: 'unknown',
      requiredScopes: [],
      resources: [],
      sensitiveKeys: [],
      pagination: { kind: 'none' },
      retry: 'never',
    }
  );
}

/** Input/output JSON schemas are supplied by the consumer's schema converter. */
export async function createActionManifest(
  provider: string,
  action: Action,
  schemas: { input: unknown; output: unknown }
) {
  const manifest = {
    provider,
    action: action.name,
    contract: resolveActionContract(action),
    inputSchema: schemas.input,
    outputSchema: schemas.output,
  };
  const canonical = canonicalJson(manifest);
  const hash = createHash('sha256').update(canonical).digest('hex');
  return { ...manifest, hash: `sha256-${hash}` };
}

export function redactActionTelemetry<T>(action: Action, value: T): T {
  return redactTelemetry(value, { sensitiveKeys: resolveActionContract(action).sensitiveKeys });
}

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 128) throw new Error('Manifest nesting exceeds limit or contains a cycle');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value)
      .sort(compareCanonicalKeys)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key], depth + 1)}`
      )
      .join(',')}}`;
  }
  throw new Error('Manifest must contain JSON values only');
}

// Explicitly preserve the default UTF-16 ordering; localeCompare would change manifest hashes.
function compareCanonicalKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
