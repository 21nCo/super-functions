import type { CollectionKey, ListCollection } from './collection';

export type SelectionMode = 'none' | 'single' | 'multiple';
export type SelectionBehavior = 'replace' | 'toggle';

export interface ListSelection<TKey extends CollectionKey> {
  readonly mode: SelectionMode;
  readonly behavior: SelectionBehavior;
  readonly selectedKeys: ReadonlySet<TKey>;
  readonly anchorKey: TKey | null;
  readonly currentKey: TKey | null;
}

export function createListSelection<TKey extends CollectionKey>(options: {
  readonly mode?: SelectionMode;
  readonly behavior?: SelectionBehavior;
  readonly selectedKeys?: Iterable<TKey>;
  readonly anchorKey?: TKey | null;
  readonly currentKey?: TKey | null;
} = {}): ListSelection<TKey> {
  const mode = options.mode ?? 'single';
  const selected = [...(options.selectedKeys ?? [])];
  return Object.freeze({
    mode,
    behavior: options.behavior ?? 'replace',
    selectedKeys: new Set(mode === 'none' ? [] : mode === 'single' ? selected.slice(0, 1) : selected),
    anchorKey: options.anchorKey ?? null,
    currentKey: options.currentKey ?? null,
  });
}

export function selectCollectionKey<T, TKey extends CollectionKey>(
  collection: ListCollection<T, TKey>,
  selection: ListSelection<TKey>,
  key: TKey,
): ListSelection<TKey> {
  if (selection.mode === 'none' || collection.isDisabled(key) || !collection.keys.includes(key)) return selection;
  const selected = new Set(selection.selectedKeys);
  if (selection.mode === 'single' || selection.behavior === 'replace') selected.clear();
  if (selection.mode === 'multiple' && selection.behavior === 'toggle' && selected.has(key)) selected.delete(key);
  else selected.add(key);
  return createListSelection({ ...selection, selectedKeys: selected, anchorKey: key, currentKey: key });
}

export function selectCollectionRange<T, TKey extends CollectionKey>(
  collection: ListCollection<T, TKey>,
  selection: ListSelection<TKey>,
  toKey: TKey,
): ListSelection<TKey> {
  if (selection.mode !== 'multiple' || collection.isDisabled(toKey)) return selectCollectionKey(collection, selection, toKey);
  const anchor = selection.anchorKey && collection.keys.includes(selection.anchorKey) ? selection.anchorKey : toKey;
  const [start, end] = [collection.indexOf(anchor), collection.indexOf(toKey)].sort((a, b) => a - b);
  const selected = new Set(selection.behavior === 'replace' ? [] : selection.selectedKeys);
  collection.keys.slice(start, end + 1).forEach((key) => {
    if (!collection.isDisabled(key)) selected.add(key);
  });
  return createListSelection({ ...selection, selectedKeys: selected, anchorKey: anchor, currentKey: toKey });
}

export function reconcileListSelection<T, TKey extends CollectionKey>(
  collection: ListCollection<T, TKey>,
  selection: ListSelection<TKey>,
): ListSelection<TKey> {
  const selected = [...selection.selectedKeys].filter((key) => collection.keys.includes(key) && !collection.isDisabled(key));
  return createListSelection({
    ...selection,
    selectedKeys: selected,
    anchorKey: selection.anchorKey !== null && collection.keys.includes(selection.anchorKey) ? selection.anchorKey : null,
    currentKey: selection.currentKey !== null && collection.enabledKeys.includes(selection.currentKey) ? selection.currentKey : null,
  });
}
