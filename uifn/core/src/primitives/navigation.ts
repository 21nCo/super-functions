import {
  advanceTypeahead,
  createListCollection,
  getNextCollectionKey,
  reconcileCollectionKey,
  resolveUIFnNavigationCommand,
  type CollectionDirection,
  type CollectionOrientation,
  type ListCollection,
  type TypeaheadState,
  type UIFnNavigationCommand,
  type UIFnNavigationPrimitive,
  type UIFnNavigationRegion,
} from '../algorithms';
import { createUIFnError } from '../errors';
import {
  createUIFnEnvironment,
  createUIFnIdAllocator,
  normalizeUIFnIdToken,
  type UIFnEnvironment,
} from '../environment';

export interface UIFnNavigationItem {
  readonly id: string;
  readonly textValue?: string;
  readonly disabled?: boolean;
  readonly parentId?: string;
  readonly href?: string;
}

export interface UIFnNavigationIds {
  readonly rootId: string;
  id(part: string, value?: string): string;
}

export interface UIFnNavigationPolicyContext {
  readonly primitive: UIFnNavigationPrimitive;
  readonly orientation?: CollectionOrientation;
  readonly direction?: CollectionDirection;
  readonly region?: UIFnNavigationRegion;
}

export function createUIFnNavigationIds(
  component: string,
  slug: string,
  env: UIFnEnvironment = {},
): UIFnNavigationIds {
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, component);
  const token = resolved.generateId(slug);
  const rootId = allocator.fromToken(`${slug}-root`, token, 'root');
  return Object.freeze({
    rootId,
    id(part: string, value?: string) {
      const suffix = value === undefined ? part : `${part}-${normalizeUIFnIdToken(value) || 'item'}`;
      return `${rootId}-${suffix}`;
    },
  });
}

export function createUIFnNavigationCollection(
  items: readonly UIFnNavigationItem[],
): ListCollection<UIFnNavigationItem, string> {
  try {
    return createListCollection({
      items,
      getKey: (item) => item.id,
      getTextValue: (item) => item.textValue ?? item.id,
      isDisabled: (item) => item.disabled ?? false,
    });
  } catch (cause) {
    throw createUIFnError({
      code: 'UIFN_NAVIGATION_COLLECTION_INVALID',
      component: 'NavigationCollection',
      cause,
      details: { itemCount: items.length },
    });
  }
}

export function getUIFnSiblingItems(
  items: readonly UIFnNavigationItem[],
  parentId?: string,
): readonly UIFnNavigationItem[] {
  return items.filter((item) => item.parentId === parentId);
}

export function getUIFnChildItems(
  items: readonly UIFnNavigationItem[],
  parentId: string,
): readonly UIFnNavigationItem[] {
  return getUIFnSiblingItems(items, parentId);
}

export function hasUIFnChildren(items: readonly UIFnNavigationItem[], id: string): boolean {
  return items.some((item) => item.parentId === id);
}

export function repairUIFnNavigationKey(
  previousItems: readonly UIFnNavigationItem[],
  nextItems: readonly UIFnNavigationItem[],
  key: string | null,
  parentId?: string,
): string | null {
  const previous = createUIFnNavigationCollection(getUIFnSiblingItems(previousItems, parentId));
  const next = createUIFnNavigationCollection(getUIFnSiblingItems(nextItems, parentId));
  return reconcileCollectionKey(next, {
    previousKey: key,
    previousIndex: key === null ? 0 : Math.max(0, previous.indexOf(key)),
  });
}

export function moveUIFnNavigationKey(
  items: readonly UIFnNavigationItem[],
  currentKey: string | null,
  command: UIFnNavigationCommand,
  options: {
    readonly parentId?: string;
    readonly orientation?: CollectionOrientation;
    readonly direction?: CollectionDirection;
    readonly loop?: boolean;
  } = {},
): string | null {
  const collection = createUIFnNavigationCollection(getUIFnSiblingItems(items, options.parentId));
  const key = command === 'next'
    ? options.orientation === 'horizontal'
      ? options.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
      : 'ArrowDown'
    : command === 'previous'
      ? options.orientation === 'horizontal'
        ? options.direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
        : 'ArrowUp'
      : command === 'first' ? 'Home' : command === 'last' ? 'End' : '';
  if (!key) return currentKey;
  return getNextCollectionKey({
    collection,
    key,
    currentKey,
    orientation: options.orientation ?? 'vertical',
    direction: options.direction ?? 'ltr',
    loop: options.loop ?? true,
  });
}

export function advanceUIFnNavigationTypeahead(
  items: readonly UIFnNavigationItem[],
  current: TypeaheadState<string>,
  key: string,
  options: { readonly parentId?: string; readonly now: number; readonly locale?: string; readonly loop?: boolean },
): TypeaheadState<string> {
  return advanceTypeahead(current, key, {
    collection: createUIFnNavigationCollection(getUIFnSiblingItems(items, options.parentId)),
    now: options.now,
    locale: options.locale,
    loop: options.loop,
  });
}

export function resolveUIFnPrimitiveKey(
  context: UIFnNavigationPolicyContext,
  key: string,
): UIFnNavigationCommand {
  return resolveUIFnNavigationCommand(context.primitive, key, {
    orientation: context.orientation,
    direction: context.direction,
    region: context.region,
  });
}

export const EMPTY_UIFN_TYPEAHEAD: TypeaheadState<string> = Object.freeze({
  query: '',
  matchedKey: null,
  updatedAt: 0,
});
