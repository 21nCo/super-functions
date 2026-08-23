import type { CollectionKey, ListCollection } from './collection';
import { createLocaleMatcher } from './locale';

export interface TypeaheadOptions<T, TKey extends CollectionKey> {
  readonly collection: ListCollection<T, TKey>;
  readonly query: string;
  readonly currentKey?: TKey | null;
  readonly locale?: string;
  readonly loop?: boolean;
}

export interface TypeaheadState<TKey extends CollectionKey> {
  readonly query: string;
  readonly matchedKey: TKey | null;
  readonly updatedAt: number;
}

export function isUIFnPrintableKey(key: string): boolean {
  return Array.from(key).length === 1 && key !== ' ';
}

function collapseRepeatedQuery(query: string): string {
  const characters = Array.from(query);
  return characters.length > 1 && characters.every((character) => character === characters[0])
    ? characters[0] ?? ''
    : query;
}

export function findTypeaheadMatch<T, TKey extends CollectionKey>(
  options: TypeaheadOptions<T, TKey>,
): TKey | null {
  const characters = Array.from(options.query);
  const repeated = characters.length > 1 && characters.every((character) => character === characters[0]);
  const query = collapseRepeatedQuery(options.query);
  if (!query || options.collection.enabledKeys.length === 0) return options.currentKey ?? null;
  const matcher = createLocaleMatcher(options.locale);
  const keys = options.collection.enabledKeys;
  if (!repeated && options.currentKey !== null && options.currentKey !== undefined
    && keys.includes(options.currentKey)
    && matcher.startsWith(options.collection.getTextValue(options.currentKey), query)) {
    return options.currentKey;
  }
  const currentIndex = options.currentKey === null || options.currentKey === undefined
    ? -1
    : keys.indexOf(options.currentKey);
  const count = options.loop === false ? keys.length - currentIndex - 1 : keys.length;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = options.loop === false ? currentIndex + offset : (currentIndex + offset + keys.length) % keys.length;
    const key = keys[index];
    if (key !== undefined && matcher.startsWith(options.collection.getTextValue(key), query)) return key;
  }
  return options.currentKey ?? null;
}

export function advanceTypeahead<T, TKey extends CollectionKey>(
  previous: TypeaheadState<TKey>,
  key: string,
  options: Omit<TypeaheadOptions<T, TKey>, 'query' | 'currentKey'> & { readonly now: number; readonly timeout?: number },
): TypeaheadState<TKey> {
  const query = options.now - previous.updatedAt > (options.timeout ?? 500) ? key : `${previous.query}${key}`;
  return Object.freeze({
    query,
    matchedKey: findTypeaheadMatch({ ...options, query, currentKey: previous.matchedKey }),
    updatedAt: options.now,
  });
}
