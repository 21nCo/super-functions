import * as React from 'react';

export interface UseIdOptions {
  prefix?: string;
  slot?: string;
}

const TOKEN_SANITIZER = /[^a-z0-9-]+/g;
const REPEATED_DASHES = /-+/g;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(TOKEN_SANITIZER, '-')
    .replace(REPEATED_DASHES, '-')
    .replace(/^-|-$/g, '');
}

function normalizeReactIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function composeIdBase(options: UseIdOptions): string {
  const prefix = normalizeToken(options.prefix ?? 'react') || 'react';
  const slot = normalizeToken(options.slot ?? '');
  return ['uifn', prefix, slot].filter(Boolean).join('-');
}

export const useId = (id?: string, options: UseIdOptions = {}): string => {
  const reactId = React.useId();
  const baseId = React.useMemo(() => composeIdBase(options), [options.prefix, options.slot]);

  if (id) {
    return id;
  }

  return `${baseId}-${normalizeReactIdSegment(reactId)}`;
};
