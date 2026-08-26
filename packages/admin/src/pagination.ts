import { AdminError } from "./errors.js";
import { stableSerialize } from "./validator.js";
import type { AdminScope } from "./types.js";

export interface AdminCursorPayload<T = unknown> {
  version: 1;
  scope: AdminScope;
  position: T;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function normalizeCursorScope(scope: AdminScope): AdminScope {
  return Object.fromEntries(
    Object.entries(scope).filter(([, value]) => value !== undefined),
  ) as AdminScope;
}

export function encodeAdminCursor<T>(scope: AdminScope, position: T): string {
  return toBase64Url(JSON.stringify({
    version: 1,
    scope: normalizeCursorScope(scope),
    position,
  } satisfies AdminCursorPayload<T>));
}

/**
 * Decodes the legacy encoded cursor after enforcing the embedded scope. This
 * helper does not authenticate cursor integrity: production domain providers
 * must issue opaque, signed cursor positions before exposing them.
 */
export function decodeAdminCursor<T>(cursor: string, expectedScope: AdminScope): T {
  try {
    const payload = JSON.parse(fromBase64Url(cursor)) as AdminCursorPayload<T>;
    if (
      payload.version !== 1
      || stableSerialize(normalizeCursorScope(payload.scope)) !== stableSerialize(normalizeCursorScope(expectedScope))
    ) {
      throw new Error("scope mismatch");
    }
    return payload.position;
  } catch (error) {
    throw new AdminError("invalid_argument", "The pagination cursor is invalid for the active scope.", { cause: error });
  }
}

export function normalizeAdminPageLimit(
  value: unknown,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): number {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 200;
  const limit = value === undefined ? defaultLimit : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new AdminError("invalid_argument", `Page limit must be an integer between 1 and ${maxLimit}.`);
  }
  return limit;
}
