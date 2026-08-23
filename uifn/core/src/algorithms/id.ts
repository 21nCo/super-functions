import { createUIFnError } from '../errors';

const TOKEN_SANITIZER = /[^a-z0-9-]+/g;
const REPEATED_DASHES = /-+/g;

/** Canonical normalization for every public, collection, and part ID segment. */
export function normalizeUIFnToken(token: string): string {
  return token
    .normalize('NFKD')
    .trim()
    .toLowerCase()
    .replace(TOKEN_SANITIZER, '-')
    .replace(REPEATED_DASHES, '-')
    .replace(/^-|-$/g, '');
}

export function composeUIFnScopedId(...segments: readonly string[]): string {
  const normalized = segments.map(normalizeUIFnToken).filter(Boolean);
  if (normalized.length !== segments.length || normalized.length === 0) {
    throw createUIFnError({
      code: 'UIFN_CORE_ENVIRONMENT_INVALID',
      component: 'Id',
      message: 'Canonical IDs MUST contain only non-empty normalized segments.',
      details: { segments },
    });
  }
  return normalized.join('-');
}

export function createUIFnPartId(scopeId: string, component: string, part: string, key?: string | number): string {
  return composeUIFnScopedId(
    scopeId,
    component,
    part,
    ...(key === undefined ? [] : [String(key)]),
  );
}
