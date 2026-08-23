import { describe, expect, it } from 'vitest';
import {
  UIFN_NAVIGATION_KEY_TABLES,
  assertUIFnKeyboardCommand,
  resolveUIFnNavigationCommand,
} from '../algorithms';
import {
  createContextMenuController,
  createMenuController,
  createMenubarController,
  createNavigationMenuController,
  createPaginationController,
  createTabsController,
  createTreeViewController,
} from '../primitives';

const env = (name: string) => ({
  mode: 'test' as const,
  scopeId: `phase08-${name}`,
  hydrationSeed: `phase08-${name}`,
  generateId: (scope: string) => `${name}-${scope}`,
  now: (() => { let value = 0; return () => value += 100; })(),
});

describe('TV-PRIM-003-P canonical keyboard tables', () => {
  it('publishes an executable non-empty table for all seven primitives', () => {
    expect(Object.keys(UIFN_NAVIGATION_KEY_TABLES)).toEqual([
      'ContextMenu', 'Menu', 'Menubar', 'NavigationMenu', 'Pagination', 'Tabs', 'TreeView',
    ]);
    Object.values(UIFN_NAVIGATION_KEY_TABLES).forEach((table) => expect(table.length).toBeGreaterThan(0));
  });

  it('keeps vertical menubar open semantics invariant in RTL', () => {
    const actual = resolveUIFnNavigationCommand('Menubar', 'ArrowDown', { direction: 'rtl', region: 'root' });
    assertUIFnKeyboardCommand(actual, 'open-first', { primitive: 'Menubar', key: 'ArrowDown', dir: 'rtl' });
    expect(resolveUIFnNavigationCommand('Menubar', 'ArrowRight', { direction: 'rtl', region: 'root' })).toBe('previous');
    expect(resolveUIFnNavigationCommand('TreeView', 'ArrowLeft', { direction: 'rtl', region: 'tree' })).toBe('expand-or-child');
  });

  it('marks tabs roving navigation as keyboard input for DOM focus transfer', () => {
    const tabs = createTabsController({ dir: 'rtl', items: ['a', 'b', 'c'], disabledItems: ['b'] }, env('tabs-keyboard-modality'));
    const modalities: Array<string | undefined> = [];
    const unsubscribe = tabs.subscribe((_state, meta) => modalities.push(meta?.inputModality), { emitInitial: false });

    expect(tabs.actions.handleKeyDown('ArrowLeft', 'a')).toBe('c');
    expect(tabs.state.focusedItem).toBe('c');
    expect(modalities).toContain('keyboard');

    unsubscribe();
    tabs.destroy();
  });

  it('activates navigation-menu triggers by default while preserving explicit link-only items', () => {
    const navigation = createNavigationMenuController({
      items: [{ id: 'products' }, { id: 'company', hasContent: true }, { id: 'docs', hasContent: false }],
    }, env('navigation-menu-activation'));

    expect(navigation.actions.handleKeyDown('Enter', 'products')).toBe('products');
    expect(navigation.state.value).toBe('products');
    expect(navigation.actions.handleKeyDown(' ', 'company')).toBe('company');
    expect(navigation.state.value).toBe('company');
    expect(navigation.actions.handleKeyDown('Enter', 'docs')).toBe('docs');
    expect(navigation.state.value).toBe('company');

    navigation.destroy();
  });

  it('prevents native button click synthesis after keyboard trigger activation', () => {
    const navigation = createNavigationMenuController({ items: [{ id: 'products' }] }, env('navigation-menu-native-click'));
    const trigger = navigation.parts.trigger.getProps('products');
    let prevented = false;

    trigger.on?.keydown?.({ key: 'Enter', preventDefault: () => { prevented = true; } });

    expect(prevented).toBe(true);
    expect(navigation.state.value).toBe('products');
    navigation.destroy();
  });

  it('throws the required negative-vector error for a seeded keyboard divergence', () => {
    expect(() => assertUIFnKeyboardCommand('previous', 'open-first', {
      vector: 'TV-PRIM-003-N', primitive: 'Menubar', key: 'ArrowDown', dir: 'rtl',
    })).toThrowError(expect.objectContaining({ code: 'UIFN_KEYBOARD_MODEL_DIVERGED' }));
  });
});

describe('TV-PRIM-003-P seven controller anatomy contracts', () => {
  it('exposes the exact declared anatomy', () => {
    const items = [{ id: 'file' }, { id: 'edit' }];
    const controllers = [
      [createContextMenuController({ items }, env('context')), ['root', 'trigger', 'positioner', 'content', 'item', 'itemIndicator', 'separator', 'group', 'groupLabel', 'submenuTrigger', 'submenuContent']],
      [createMenuController({ items }, env('menu')), ['root', 'trigger', 'positioner', 'content', 'item', 'itemIndicator', 'separator', 'group', 'groupLabel', 'submenuTrigger', 'submenuContent']],
      [createMenubarController({ items }, env('menubar')), ['root', 'menu', 'trigger', 'content', 'item', 'submenuTrigger', 'submenuContent']],
      [createNavigationMenuController({ items }, env('nav')), ['root', 'list', 'item', 'trigger', 'content', 'link', 'viewport', 'indicator']],
      [createPaginationController({ count: 100 }, env('pagination')), ['root', 'list', 'item', 'pageTrigger', 'previous', 'next', 'ellipsis']],
      [createTabsController({ items: ['file', 'edit'] }, env('tabs')), ['root', 'list', 'trigger', 'content', 'indicator']],
      [createTreeViewController({ items }, env('tree')), ['root', 'label', 'tree', 'item', 'itemTrigger', 'itemText', 'branch', 'indicator']],
    ] as const;
    for (const [controller, anatomy] of controllers) {
      expect(Object.keys(controller.parts)).toEqual(anatomy);
      expect(Object.isFrozen(controller.snapshot.state)).toBe(true);
      controller.destroy();
    }
  });
});

describe('TV-PRIM-003-P menu/nesting/typeahead behavior', () => {
  const items = [
    { id: 'alpha', textValue: 'Alpha' },
    { id: 'disabled', textValue: 'Beta', disabled: true },
    { id: 'more', textValue: 'More' },
    { id: 'child-a', parentId: 'more', textValue: 'Child A' },
    { id: 'child-b', parentId: 'more', textValue: 'Child B' },
  ];

  it('navigates disabled items, opens submenus, and returns focus', () => {
    const menu = createMenuController({ defaultOpen: true, items }, env('menu-behavior'));
    expect(menu.state.activeItem).toBe('alpha');
    expect(menu.actions.handleKeyDown('ArrowDown', 'alpha')).toBe('more');
    expect(menu.actions.handleKeyDown('ArrowRight', 'more')).toBe('child-a');
    expect(menu.state.submenuPath).toEqual(['more']);
    expect(menu.actions.handleKeyDown('ArrowLeft', 'child-a')).toBe('more');
    expect(menu.state.focusReturn).toBe('parent-trigger');
    menu.destroy();
  });

  it('uses bounded locale-aware typeahead and repairs the same logical slot after removal', () => {
    const menu = createContextMenuController({ defaultOpen: true, items }, env('context-behavior'));
    expect(menu.actions.handleKeyDown('m', 'alpha')).toBe('more');
    menu.actions.unregisterItem('more');
    expect(menu.state.activeItem).toBe('alpha');
    expect(menu.state.submenuPath).toEqual([]);
    menu.destroy();
  });

  it('opens a context menu from both keyboard context-menu conventions', () => {
    for (const event of [{ key: 'ContextMenu' }, { key: 'F10', shiftKey: true }]) {
      const menu = createContextMenuController({ items }, env(`context-keyboard-${event.key}`));
      const trigger = menu.parts.trigger.getProps();
      let prevented = false;
      expect(trigger.tabIndex).toBe(0);
      expect(trigger.aria?.haspopup).toBe('menu');
      trigger.on?.keydown?.({
        type: 'keydown',
        ...event,
        preventDefault: () => { prevented = true; },
      });
      expect(prevented).toBe(true);
      expect(menu.state.open).toBe(true);
      expect(menu.state.lastChangeMeta?.inputModality).toBe('keyboard');
      menu.destroy();
    }
  });

  it('lets Escape close an open menubar from either the trigger or content focus model', () => {
    const bar = createMenubarController({
      defaultValue: 'file',
      items: [{ id: 'file' }, { id: 'new', parentId: 'file' }],
    }, env('menubar-escape'));

    expect(bar.state.value).toBe('file');
    expect(bar.actions.handleTriggerKeyDown('Escape', 'file')).toBe('file');
    expect(bar.state.value).toBe('');
    expect(bar.state.focusReturn).toBe('file');
    bar.destroy();
  });
});

describe('TV-PRIM-003-P dynamic collection and controlled repair', () => {
  it('repairs uncontrolled tabs by stable prior index and requests controlled repair', () => {
    const uncontrolled = createTabsController({ items: ['a', 'b', 'c'], defaultValue: 'b' }, env('tabs-uncontrolled'));
    uncontrolled.actions.unregisterItem('b');
    expect(uncontrolled.state.value).toBe('c');
    expect(uncontrolled.state.focusedItem).toBe('c');

    const requests: string[] = [];
    const controlled = createTabsController({ items: ['a', 'b', 'c'], value: 'b', onValueChange: (value) => requests.push(value) }, env('tabs-controlled'));
    controlled.actions.unregisterItem('b');
    expect(controlled.state.value).toBe('b');
    expect(controlled.state.focusedItem).toBe('c');
    expect(controlled.state.requestedRepair).toBe('c');
    expect(requests).toEqual(['c']);
    uncontrolled.destroy(); controlled.destroy();
  });

  it('repairs an active menubar root when it is removed or disabled', () => {
    const bar = createMenubarController({ items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, env('bar-repair'));
    bar.actions.focusMenu('b');
    bar.actions.unregisterItem('b');
    expect(bar.state.focusedMenu).toBe('c');
    bar.actions.setItemDisabled('c', true);
    expect(bar.state.focusedMenu).toBe('a');
    bar.destroy();
  });

  it('keeps pagination in range after data shrink', () => {
    const pagination = createPaginationController({ count: 100, pageSize: 10, defaultPage: 10 }, env('page-repair'));
    pagination.actions.setCount(12);
    expect(pagination.state.page).toBe(2);
    expect(pagination.state.pageCount).toBe(2);
    pagination.destroy();
  });
});

describe('TV-PRIM-003-P tree and property-style sequences', () => {
  const items = [
    { id: 'a', children: [{ id: 'a-1' }, { id: 'a-2', disabled: true }] },
    { id: 'b' },
    { id: 'c' },
  ];

  it('expands, enters, returns to parent, selects, and repairs focus', () => {
    const tree = createTreeViewController({ items, defaultExpanded: [] }, env('tree-behavior'));
    expect(tree.actions.handleKeyDown('ArrowRight', 'a')).toBe('a');
    expect(tree.state.expanded).toEqual(['a']);
    expect(tree.actions.handleKeyDown('ArrowRight', 'a')).toBe('a-1');
    expect(tree.actions.handleKeyDown('ArrowLeft', 'a-1')).toBe('a');
    tree.actions.handleKeyDown(' ', 'a');
    expect(tree.state.selection).toEqual(['a']);
    tree.actions.setItems([{ id: 'b' }, { id: 'c' }]);
    expect(tree.state.focusedItem).toBe('b');
    expect(tree.state.selection).toEqual([]);
    tree.destroy();
  });

  it('preserves the invariant over deterministic insert/remove/reorder/disable sequences', () => {
    const menu = createMenuController({ defaultOpen: true, items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, env('model-sequence'));
    const sequence = [
      [{ id: 'x' }, { id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'c' }, { id: 'b' }, { id: 'a' }, { id: 'x' }],
      [{ id: 'c', disabled: true }, { id: 'b' }, { id: 'a' }],
      [{ id: 'c', disabled: true }, { id: 'a' }],
    ];
    menu.actions.focusItem('b');
    for (const nextItems of sequence) {
      menu.actions.setItems(nextItems);
      const active = menu.state.activeItem;
      expect(active === null || nextItems.some((item) => item.id === active && !item.disabled)).toBe(true);
    }
    expect(menu.state.activeItem).toBe('a');
    menu.destroy();
  });
});
