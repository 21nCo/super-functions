import { createUIFnError } from '../errors';

export type CollectionKey = string | number;

export interface ListCollectionOptions<T, TKey extends CollectionKey = CollectionKey> {
  readonly items?: readonly T[];
  readonly getKey: (item: T) => TKey;
  readonly getTextValue?: (item: T) => string;
  readonly isDisabled?: (item: T) => boolean;
}

export interface ListCollection<T, TKey extends CollectionKey = CollectionKey> {
  readonly size: number;
  readonly items: readonly T[];
  readonly keys: readonly TKey[];
  readonly enabledKeys: readonly TKey[];
  at(index: number): T | undefined;
  getItem(key: TKey): T | undefined;
  getKey(item: T): TKey;
  getTextValue(key: TKey): string;
  isDisabled(key: TKey): boolean;
  indexOf(key: TKey): number;
  enabledIndexOf(key: TKey): number;
  withItems(items: readonly T[]): ListCollection<T, TKey>;
}

function invariant(message: string, details: Record<string, unknown>): never {
  throw createUIFnError({
    code: 'UIFN_ERR_INVALID_VALUE',
    component: 'ListCollection',
    message,
    details: { invariant: 'UIFN_COLLECTION_INVARIANT', ...details },
  });
}

export function createListCollection<T, TKey extends CollectionKey = CollectionKey>(
  options: ListCollectionOptions<T, TKey>,
): ListCollection<T, TKey> {
  const items = Object.freeze([...(options.items ?? [])]);
  const keys = items.map(options.getKey);
  const byKey = new Map<TKey, T>();
  keys.forEach((key, index) => {
    if ((typeof key !== 'string' && typeof key !== 'number') || (typeof key === 'string' && key.length === 0)) {
      invariant('Collection keys MUST be non-empty strings or finite numbers.', { key, index });
    }
    if (typeof key === 'number' && !Number.isFinite(key)) {
      invariant('Numeric collection keys MUST be finite.', { key, index });
    }
    if (byKey.has(key)) {
      invariant('Collection keys MUST be unique and stable.', { key, index });
    }
    byKey.set(key, items[index] as T);
  });
  const disabled = new Set<TKey>(
    items.filter((item) => options.isDisabled?.(item) ?? false).map(options.getKey),
  );
  const enabledKeys = Object.freeze(keys.filter((key) => !disabled.has(key)));
  const frozenKeys = Object.freeze(keys);

  return Object.freeze({
    size: items.length,
    items,
    keys: frozenKeys,
    enabledKeys,
    at: (index: number) => items[index],
    getItem: (key: TKey) => byKey.get(key),
    getKey: options.getKey,
    getTextValue(key: TKey) {
      const item = byKey.get(key);
      if (item === undefined) return '';
      return options.getTextValue?.(item) ?? String(options.getKey(item));
    },
    isDisabled: (key: TKey) => disabled.has(key),
    indexOf: (key: TKey) => frozenKeys.indexOf(key),
    enabledIndexOf: (key: TKey) => enabledKeys.indexOf(key),
    withItems: (nextItems: readonly T[]) => createListCollection({ ...options, items: nextItems }),
  });
}

export interface ReconcileCollectionKeyOptions<TKey extends CollectionKey> {
  readonly previousKey: TKey | null;
  readonly previousIndex?: number;
  readonly allowDisabled?: boolean;
}

/** Keeps a stable active key across insert/reorder and chooses the nearest valid key after removal. */
export function reconcileCollectionKey<T, TKey extends CollectionKey>(
  collection: ListCollection<T, TKey>,
  options: ReconcileCollectionKeyOptions<TKey>,
): TKey | null {
  const candidates = options.allowDisabled ? collection.keys : collection.enabledKeys;
  if (options.previousKey !== null && candidates.includes(options.previousKey)) return options.previousKey;
  if (candidates.length === 0) return null;
  const index = Math.max(0, Math.min(options.previousIndex ?? 0, collection.size - 1));
  for (let distance = 0; distance < collection.size; distance += 1) {
    const after = collection.keys[index + distance];
    if (after !== undefined && candidates.includes(after)) return after;
    const before = collection.keys[index - distance - 1];
    if (before !== undefined && candidates.includes(before)) return before;
  }
  return candidates[0] ?? null;
}

export interface TreeNodeOptions<T, TKey extends CollectionKey = CollectionKey>
  extends Omit<ListCollectionOptions<T, TKey>, 'items'> {
  readonly items?: readonly T[];
  readonly getChildren: (item: T) => readonly T[] | undefined;
}

export interface TreeCollection<T, TKey extends CollectionKey = CollectionKey> {
  readonly roots: ListCollection<T, TKey>;
  flatten(expandedKeys?: ReadonlySet<TKey>): ListCollection<T, TKey>;
}

export function createTreeCollection<T, TKey extends CollectionKey = CollectionKey>(
  options: TreeNodeOptions<T, TKey>,
): TreeCollection<T, TKey> {
  const roots = createListCollection({ ...options, items: options.items });
  const visit = (items: readonly T[], expanded: ReadonlySet<TKey>, result: T[], ancestors: Set<TKey>) => {
    for (const item of items) {
      const key = options.getKey(item);
      if (ancestors.has(key)) invariant('TreeCollection MUST NOT contain cycles.', { key });
      result.push(item);
      if (!expanded.has(key)) continue;
      const children = options.getChildren(item) ?? [];
      const nextAncestors = new Set(ancestors).add(key);
      visit(children, expanded, result, nextAncestors);
    }
  };
  return Object.freeze({
    roots,
    flatten(expandedKeys = new Set<TKey>()) {
      const items: T[] = [];
      visit(roots.items, expandedKeys, items, new Set());
      return createListCollection({ ...options, items });
    },
  });
}
