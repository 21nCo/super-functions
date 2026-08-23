import type { CollectionKey, ListCollection } from './collection';
import { createUIFnError } from '../errors';

export type CollectionOrientation = 'horizontal' | 'vertical';
export type CollectionDirection = 'ltr' | 'rtl';

export type UIFnNavigationPrimitive =
  | 'ContextMenu'
  | 'Menu'
  | 'Menubar'
  | 'NavigationMenu'
  | 'Pagination'
  | 'Tabs'
  | 'TreeView';

export type UIFnNavigationRegion = 'root' | 'content' | 'tree';

export type UIFnNavigationCommand =
  | 'none'
  | 'first'
  | 'last'
  | 'next'
  | 'previous'
  | 'activate'
  | 'select'
  | 'open'
  | 'open-first'
  | 'open-last'
  | 'close'
  | 'expand-or-child'
  | 'collapse-or-parent'
  | 'page-next'
  | 'page-previous'
  | 'typeahead';

export interface UIFnKeyboardContext {
  readonly orientation?: CollectionOrientation;
  readonly direction?: CollectionDirection;
  readonly region?: UIFnNavigationRegion;
  readonly hasChildren?: boolean;
  readonly expanded?: boolean;
}

export interface UIFnKeyboardTableEntry {
  readonly key: string;
  readonly command: UIFnNavigationCommand;
  readonly region?: UIFnNavigationRegion;
  readonly note: string;
}

/**
 * The one executable keyboard contract for the seven collection/navigation primitives.
 * Controllers call resolveUIFnNavigationCommand; adapters and DOM bindings do not reinterpret keys.
 */
export const UIFN_NAVIGATION_KEY_TABLES = Object.freeze({
  ContextMenu: Object.freeze([
    { key: 'ArrowDown', command: 'next', region: 'content', note: 'Next enabled item.' },
    { key: 'ArrowUp', command: 'previous', region: 'content', note: 'Previous enabled item.' },
    { key: 'Home', command: 'first', region: 'content', note: 'First enabled item.' },
    { key: 'End', command: 'last', region: 'content', note: 'Last enabled item.' },
    { key: 'Enter', command: 'activate', region: 'content', note: 'Select or open submenu.' },
    { key: ' ', command: 'activate', region: 'content', note: 'Select or open submenu.' },
    { key: 'Escape', command: 'close', region: 'content', note: 'Close current menu and restore focus.' },
  ]),
  Menu: Object.freeze([
    { key: 'ArrowDown', command: 'next', region: 'content', note: 'Next enabled item.' },
    { key: 'ArrowUp', command: 'previous', region: 'content', note: 'Previous enabled item.' },
    { key: 'Home', command: 'first', region: 'content', note: 'First enabled item.' },
    { key: 'End', command: 'last', region: 'content', note: 'Last enabled item.' },
    { key: 'Enter', command: 'activate', region: 'content', note: 'Select or open submenu.' },
    { key: ' ', command: 'activate', region: 'content', note: 'Select or open submenu.' },
    { key: 'Escape', command: 'close', region: 'content', note: 'Close current menu and restore focus.' },
  ]),
  Menubar: Object.freeze([
    { key: 'ArrowRight', command: 'next', region: 'root', note: 'Next top-level menu in logical direction.' },
    { key: 'ArrowLeft', command: 'previous', region: 'root', note: 'Previous top-level menu in logical direction.' },
    { key: 'ArrowDown', command: 'open-first', region: 'root', note: 'Open first item; never mirrored in RTL.' },
    { key: 'ArrowUp', command: 'open-last', region: 'root', note: 'Open last item; never mirrored in RTL.' },
    { key: 'Enter', command: 'open-first', region: 'root', note: 'Open first item.' },
    { key: ' ', command: 'open-first', region: 'root', note: 'Open first item.' },
    { key: 'Home', command: 'first', region: 'root', note: 'First top-level menu.' },
    { key: 'End', command: 'last', region: 'root', note: 'Last top-level menu.' },
    { key: 'ArrowDown', command: 'next', region: 'content', note: 'Next item in open menu.' },
    { key: 'ArrowUp', command: 'previous', region: 'content', note: 'Previous item in open menu.' },
    { key: 'Escape', command: 'close', region: 'content', note: 'Close and restore focus to trigger.' },
  ]),
  NavigationMenu: Object.freeze([
    { key: 'ArrowRight', command: 'next', region: 'root', note: 'Next item for horizontal LTR.' },
    { key: 'ArrowLeft', command: 'previous', region: 'root', note: 'Previous item for horizontal LTR.' },
    { key: 'ArrowDown', command: 'next', region: 'root', note: 'Next item for vertical orientation.' },
    { key: 'ArrowUp', command: 'previous', region: 'root', note: 'Previous item for vertical orientation.' },
    { key: 'Home', command: 'first', region: 'root', note: 'First enabled item.' },
    { key: 'End', command: 'last', region: 'root', note: 'Last enabled item.' },
    { key: 'Enter', command: 'activate', region: 'root', note: 'Open content or follow link.' },
    { key: ' ', command: 'activate', region: 'root', note: 'Open content.' },
    { key: 'Escape', command: 'close', region: 'content', note: 'Close content and restore trigger focus.' },
  ]),
  Pagination: Object.freeze([
    { key: 'ArrowRight', command: 'page-next', region: 'root', note: 'Next page in logical direction.' },
    { key: 'ArrowLeft', command: 'page-previous', region: 'root', note: 'Previous page in logical direction.' },
    { key: 'Home', command: 'first', region: 'root', note: 'First page.' },
    { key: 'End', command: 'last', region: 'root', note: 'Last page.' },
    { key: 'PageDown', command: 'page-next', region: 'root', note: 'Next page.' },
    { key: 'PageUp', command: 'page-previous', region: 'root', note: 'Previous page.' },
    { key: 'Enter', command: 'activate', region: 'root', note: 'Go to focused page.' },
  ]),
  Tabs: Object.freeze([
    { key: 'ArrowRight', command: 'next', region: 'root', note: 'Next tab for horizontal LTR.' },
    { key: 'ArrowLeft', command: 'previous', region: 'root', note: 'Previous tab for horizontal LTR.' },
    { key: 'ArrowDown', command: 'next', region: 'root', note: 'Next tab for vertical orientation.' },
    { key: 'ArrowUp', command: 'previous', region: 'root', note: 'Previous tab for vertical orientation.' },
    { key: 'Home', command: 'first', region: 'root', note: 'First enabled tab.' },
    { key: 'End', command: 'last', region: 'root', note: 'Last enabled tab.' },
    { key: 'Enter', command: 'activate', region: 'root', note: 'Activate focused tab in manual mode.' },
    { key: ' ', command: 'activate', region: 'root', note: 'Activate focused tab in manual mode.' },
  ]),
  TreeView: Object.freeze([
    { key: 'ArrowDown', command: 'next', region: 'tree', note: 'Next visible node.' },
    { key: 'ArrowUp', command: 'previous', region: 'tree', note: 'Previous visible node.' },
    { key: 'ArrowRight', command: 'expand-or-child', region: 'tree', note: 'Expand or move to first child in LTR.' },
    { key: 'ArrowLeft', command: 'collapse-or-parent', region: 'tree', note: 'Collapse or move to parent in LTR.' },
    { key: 'Home', command: 'first', region: 'tree', note: 'First visible node.' },
    { key: 'End', command: 'last', region: 'tree', note: 'Last visible node.' },
    { key: 'Enter', command: 'select', region: 'tree', note: 'Select focused node.' },
    { key: ' ', command: 'select', region: 'tree', note: 'Select focused node.' },
  ]),
}) as unknown as Readonly<Record<UIFnNavigationPrimitive, readonly UIFnKeyboardTableEntry[]>>;

function logicalHorizontalCommand(
  key: string,
  direction: CollectionDirection,
  forward: UIFnNavigationCommand,
  backward: UIFnNavigationCommand,
): UIFnNavigationCommand {
  if (key === (direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight')) return forward;
  if (key === (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')) return backward;
  return 'none';
}

export function resolveUIFnNavigationCommand(
  primitive: UIFnNavigationPrimitive,
  key: string,
  context: UIFnKeyboardContext = {},
): UIFnNavigationCommand {
  const direction = context.direction ?? 'ltr';
  const orientation = context.orientation ?? 'horizontal';
  const region = context.region ?? (primitive === 'TreeView' ? 'tree' : 'root');

  if (primitive === 'Menu' || primitive === 'ContextMenu') {
    const horizontal = logicalHorizontalCommand(key, direction, 'open', 'close');
    if (horizontal !== 'none') return horizontal;
  }
  if (primitive === 'Menubar' && region === 'root') {
    const horizontal = logicalHorizontalCommand(key, direction, 'next', 'previous');
    if (horizontal !== 'none') return horizontal;
    if (key === 'ArrowDown' || key === 'Enter' || key === ' ') return 'open-first';
    if (key === 'ArrowUp') return 'open-last';
  }
  if (primitive === 'TreeView') {
    const horizontal = logicalHorizontalCommand(key, direction, 'expand-or-child', 'collapse-or-parent');
    if (horizontal !== 'none') return horizontal;
  }
  if (primitive === 'Pagination') {
    const horizontal = logicalHorizontalCommand(key, direction, 'page-next', 'page-previous');
    if (horizontal !== 'none') return horizontal;
  }
  if ((primitive === 'Tabs' || primitive === 'NavigationMenu') && region === 'root') {
    if (orientation === 'horizontal') {
      const horizontal = logicalHorizontalCommand(key, direction, 'next', 'previous');
      if (horizontal !== 'none') return horizontal;
    } else {
      if (key === 'ArrowDown') return 'next';
      if (key === 'ArrowUp') return 'previous';
    }
  }

  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (key === 'ArrowDown') return 'next';
  if (key === 'ArrowUp') return 'previous';
  if (key === 'Enter' || key === ' ') return primitive === 'TreeView' ? 'select' : 'activate';
  if (key === 'Escape') return 'close';
  if (key === 'PageDown' && primitive === 'Pagination') return 'page-next';
  if (key === 'PageUp' && primitive === 'Pagination') return 'page-previous';
  if (Array.from(key).length === 1 && key !== ' ') return 'typeahead';
  return 'none';
}

export function assertUIFnKeyboardCommand(
  actual: UIFnNavigationCommand,
  expected: UIFnNavigationCommand,
  details: Record<string, unknown>,
): void {
  if (actual === expected) return;
  throw createUIFnError({
    code: 'UIFN_KEYBOARD_MODEL_DIVERGED',
    component: 'Navigation',
    details: { ...details, actual, expected },
  });
}

export interface CollectionNavigationOptions<T, TKey extends CollectionKey> {
  readonly collection: ListCollection<T, TKey>;
  readonly key: string;
  readonly currentKey: TKey | null;
  readonly orientation?: CollectionOrientation;
  readonly direction?: CollectionDirection;
  readonly loop?: boolean;
}

export interface EnabledIndexNavigationOptions {
  readonly key: string;
  readonly itemCount: number;
  readonly currentIndex: number;
  readonly orientation?: CollectionOrientation;
  readonly direction?: CollectionDirection;
  readonly loop?: boolean;
  readonly isItemEnabled?: (index: number) => boolean;
}

function movementForKey(key: string, orientation: CollectionOrientation, direction: CollectionDirection): number | 'first' | 'last' | null {
  if (key === 'Home') return 'first';
  if (key === 'End') return 'last';
  if (orientation === 'vertical') {
    if (key === 'ArrowDown') return 1;
    if (key === 'ArrowUp') return -1;
  } else {
    if (key === 'ArrowRight') return direction === 'rtl' ? -1 : 1;
    if (key === 'ArrowLeft') return direction === 'rtl' ? 1 : -1;
  }
  return null;
}

export function getNextEnabledIndex(options: EnabledIndexNavigationOptions): number {
  if (options.itemCount <= 0) return -1;
  const orientation = options.orientation ?? 'horizontal';
  const direction = options.direction ?? 'ltr';
  const movement = movementForKey(options.key, orientation, direction);
  const current = Math.max(0, Math.min(options.currentIndex, options.itemCount - 1));
  if (movement === null) return current;
  const enabled = options.isItemEnabled ?? (() => true);
  const loop = options.loop ?? true;
  if (movement === 'first' || movement === 'last') {
    const start = movement === 'first' ? 0 : options.itemCount - 1;
    const step = movement === 'first' ? 1 : -1;
    for (let index = start; index >= 0 && index < options.itemCount; index += step) {
      if (enabled(index)) return index;
    }
    return current;
  }
  for (let distance = 1; distance <= options.itemCount; distance += 1) {
    let candidate = current + movement * distance;
    if (loop) candidate = (candidate + options.itemCount * (distance + 1)) % options.itemCount;
    if (!loop && (candidate < 0 || candidate >= options.itemCount)) return current;
    if (enabled(candidate)) return candidate;
  }
  return current;
}

export function getNextCollectionKey<T, TKey extends CollectionKey>(
  options: CollectionNavigationOptions<T, TKey>,
): TKey | null {
  const { collection } = options;
  if (collection.size === 0 || collection.enabledKeys.length === 0) return null;
  const currentIndex = Math.max(0, collection.indexOf(options.currentKey ?? collection.enabledKeys[0] as TKey));
  const nextIndex = getNextEnabledIndex({
    key: options.key,
    itemCount: collection.size,
    currentIndex,
    orientation: options.orientation,
    direction: options.direction,
    loop: options.loop,
    isItemEnabled: (index) => {
      const key = collection.keys[index];
      return key !== undefined && !collection.isDisabled(key);
    },
  });
  return collection.keys[nextIndex] ?? options.currentKey ?? collection.enabledKeys[0] ?? null;
}
