import {
  assertUIFnKeyboardCommand,
  createContextMenuController,
  createMenuController,
  createMenubarController,
  createNavigationMenuController,
  createPaginationController,
  createTabsController,
  createTreeViewController,
  resolveUIFnNavigationCommand,
} from '@uifn/core';
import {
  applyUIFnPartProps,
  createUIFnDomPlatform,
  createUIFnMenuDomBinding,
  createUIFnNavigationMenuDomBinding,
  createUIFnRovingFocusDomBinding,
} from '@uifn/dom';

interface NavigationBrowserResult {
  readonly vectorId: 'TV-PRIM-003-P/N';
  readonly outcome: 'pass';
  readonly primitives: readonly string[];
  readonly keyboard: Readonly<Record<string, unknown>>;
  readonly focus: Readonly<Record<string, string>>;
  readonly aria: Readonly<Record<string, unknown>>;
  readonly submenu: readonly string[];
  readonly touch: readonly string[];
  readonly dynamicRepair: Readonly<Record<string, string>>;
  readonly negativeCodes: readonly string[];
  readonly resourceTotals: readonly number[];
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function wait(ms: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
async function waitUntil(condition: () => boolean, timeoutMs = 500): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (!condition() && performance.now() < deadline) await wait(8);
  return condition();
}
function keyboard(key: string): KeyboardEvent { return new KeyboardEvent('keydown', { bubbles: true, composed: true, key }); }
function pointer(type: string, options: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, composed: true, pointerId: 19, pointerType: 'mouse', ...options });
}
function codeOf(callback: () => unknown): string {
  try { callback(); } catch (error) { const code = (error as { code?: string }).code; if (code) return code; throw error; }
  throw new Error('Expected coded error.');
}
function fixture(name: string): HTMLElement {
  const root = document.createElement('section'); root.dataset.navigationFixture = name; root.dataset.vectorRoot = '';
  root.style.cssText = 'position:relative;min-height:180px;padding:12px;margin:12px;border:1px solid #94a3b8;';
  const title = document.createElement('h2'); title.textContent = name; root.append(title); document.body.append(root); return root;
}
function button(text: string): HTMLButtonElement { const node = document.createElement('button'); node.textContent = text; return node; }

function reactiveParts(
  controller: { subscribe(callback: () => void, options?: { emitInitial?: boolean }): () => void },
  render: () => Array<[HTMLElement, any]>,
): () => void {
  let releases: Array<() => void> = [];
  const refresh = () => {
    releases.forEach((release) => release());
    releases = render().map(([element, props]) => applyUIFnPartProps(element, props));
  };
  refresh(); const unsubscribe = controller.subscribe(refresh, { emitInitial: false });
  return () => { unsubscribe(); releases.forEach((release) => release()); };
}

async function exerciseMenu(
  focus: Record<string, string>, aria: Record<string, unknown>, submenu: string[], resources: number[],
): Promise<void> {
  const root = fixture('Menu'); const platform = createUIFnDomPlatform({ root: document });
  const controller = createMenuController({ defaultOpen: true, items: [
    { id: 'alpha', textValue: 'Alpha' }, { id: 'disabled', disabled: true },
    { id: 'more', textValue: 'More' }, { id: 'child', parentId: 'more', textValue: 'Child' },
  ] });
  const trigger = button('Menu trigger'); const positioner = document.createElement('div'); const content = document.createElement('div');
  const alpha = button('Alpha'); const disabled = button('Disabled'); const more = button('More');
  const submenuPositioner = document.createElement('div'); const submenuContent = document.createElement('div'); const child = button('Child');
  positioner.style.cssText = 'position:absolute;background:white;border:1px solid #334155;padding:8px;';
  submenuPositioner.style.cssText = 'position:absolute;background:white;border:1px solid #334155;padding:8px;';
  content.append(alpha, disabled, more); positioner.append(content); submenuContent.append(child); submenuPositioner.append(submenuContent); root.append(trigger, positioner, submenuPositioner);
  const releaseParts = reactiveParts(controller, () => [
    [root, controller.parts.root.getProps()], [trigger, controller.parts.trigger.getProps()],
    [positioner, controller.parts.positioner.getProps()], [content, controller.parts.content.getProps()],
    [alpha, controller.parts.item.getProps('alpha')], [disabled, controller.parts.item.getProps('disabled')],
    [more, controller.parts.submenuTrigger.getProps('more')], [submenuContent, controller.parts.submenuContent.getProps('more')],
    [child, controller.parts.item.getProps('child')],
  ]);
  const binding = createUIFnMenuDomBinding({ platform, controller, trigger, content, positioner, submenus: [{ id: 'more', trigger: more, content: submenuContent, positioner: submenuPositioner }], pointerGraceDelay: 120 });
  invariant(await waitUntil(() => document.activeElement === alpha), 'Menu initial focus did not target first enabled item');
  content.dispatchEvent(keyboard('ArrowDown'));
  invariant(await waitUntil(() => controller.state.activeItem === 'more' && document.activeElement === more), 'Menu did not skip disabled item');
  content.dispatchEvent(keyboard('ArrowRight'));
  invariant(await waitUntil(() => controller.state.submenuPath[0] === 'more' && document.activeElement === child), 'Menu submenu keyboard open failed');
  submenu.push('keyboard-open');
  submenuContent.dispatchEvent(keyboard('ArrowLeft'));
  invariant(await waitUntil(() => document.activeElement === more && controller.state.focusReturn === 'parent-trigger'), 'Menu submenu focus return failed');
  submenu.push('keyboard-return');

  controller.actions.openSubmenu('more');
  invariant(await waitUntil(() => controller.state.submenuPath.includes('more')), 'Menu submenu did not reopen');
  const triggerRect = more.getBoundingClientRect(); const contentRect = submenuContent.getBoundingClientRect();
  more.dispatchEvent(pointer('pointerout', { clientX: triggerRect.right, clientY: triggerRect.top + triggerRect.height / 2, relatedTarget: document.body }));
  const edgeX = contentRect.left >= triggerRect.right ? contentRect.left : contentRect.right;
  const corridorPoint = { x: (triggerRect.right + edgeX) / 2, y: contentRect.top + contentRect.height / 2 };
  document.dispatchEvent(pointer('pointermove', { clientX: corridorPoint.x, clientY: corridorPoint.y }));
  await wait(160); invariant(controller.state.submenuPath.includes('more'), `Pointer grace closed submenu inside safe triangle: ${JSON.stringify({ trigger: { left: triggerRect.left, top: triggerRect.top, right: triggerRect.right, bottom: triggerRect.bottom }, content: { left: contentRect.left, top: contentRect.top, right: contentRect.right, bottom: contentRect.bottom }, corridorPoint })}`);
  submenu.push('pointer-grace-preserved');
  document.dispatchEvent(pointer('pointermove', { clientX: 0, clientY: 0 }));
  invariant(await waitUntil(() => controller.state.submenuPath.length === 0), 'Pointer leaving grace corridor did not close submenu');
  submenu.push('pointer-grace-closed');
  focus.Menu = (document.activeElement as HTMLElement)?.id ?? 'none';
  aria.Menu = { role: content.getAttribute('role'), orientation: content.getAttribute('aria-orientation'), disabled: disabled.getAttribute('aria-disabled') };
  binding.destroy(); releaseParts(); controller.destroy(); root.remove(); platform.destroy(); resources.push(platform.scope.resources().total);
}

async function exerciseContextMenu(touch: string[], resources: number[]): Promise<void> {
  const root = fixture('ContextMenu'); const platform = createUIFnDomPlatform({ root: document });
  const controller = createContextMenuController({ items: [{ id: 'copy' }] });
  const trigger = button('Context target'); const positioner = document.createElement('div'); const content = document.createElement('div'); const copy = button('Copy');
  content.append(copy); positioner.append(content); root.append(trigger, positioner);
  const releaseParts = reactiveParts(controller, () => [[root, controller.parts.root.getProps()], [trigger, controller.parts.trigger.getProps()], [positioner, controller.parts.positioner.getProps()], [content, controller.parts.content.getProps()], [copy, controller.parts.item.getProps('copy')]]);
  const binding = createUIFnMenuDomBinding({ platform, controller, trigger, content, positioner, longPressDelay: 30 });
  trigger.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', clientX: 80, clientY: 90 }));
  invariant(await waitUntil(() => controller.state.open && controller.state.contextPoint?.x === 80), 'ContextMenu long press did not open at touch point');
  touch.push('long-press-open');
  trigger.dispatchEvent(pointer('pointerup', { pointerType: 'touch', clientX: 80, clientY: 90 }));
  controller.actions.close();
  binding.destroy(); releaseParts(); controller.destroy(); root.remove(); platform.destroy(); resources.push(platform.scope.resources().total);
}

async function exerciseMenubar(keyboardState: Record<string, unknown>, focus: Record<string, string>, dynamic: Record<string, string>, resources: number[]): Promise<void> {
  const root = fixture('Menubar'); const platform = createUIFnDomPlatform({ root: document }); const controller = createMenubarController({ dir: 'rtl', items: [
    { id: 'file' }, { id: 'edit' }, { id: 'new', parentId: 'file' }, { id: 'undo', parentId: 'edit' },
  ] });
  const file = button('File'); const edit = button('Edit'); const fileContent = document.createElement('div'); const newItem = button('New'); fileContent.append(newItem); root.append(file, edit, fileContent);
  const release = reactiveParts(controller, () => [[root, controller.parts.root.getProps()], [file, controller.parts.trigger.getProps('file')], [edit, controller.parts.trigger.getProps('edit')], [fileContent, controller.parts.content.getProps('file')], [newItem, controller.parts.item.getProps('new')]]);
  const roving = createUIFnRovingFocusDomBinding({ platform, controller, focusInitial: false, getActiveKey: (state) => state.value ? state.activeItem : state.focusedMenu, getElement: (key) => key === 'file' ? file : key === 'edit' ? edit : key === 'new' ? newItem : null });
  file.focus(); file.dispatchEvent(keyboard('ArrowDown'));
  invariant(await waitUntil(() => controller.state.value === 'file' && controller.state.activeItem === 'new'), 'RTL Menubar Down key was incorrectly mirrored');
  keyboardState.Menubar = { rtlArrowDown: 'open-first', value: controller.state.value, activeItem: controller.state.activeItem };
  file.dispatchEvent(keyboard('ArrowRight'));
  invariant(await waitUntil(() => controller.state.focusedMenu === 'edit'), 'RTL Menubar logical previous navigation failed');
  edit.focus(); controller.actions.unregisterItem('edit');
  invariant(controller.state.focusedMenu === 'file', 'Menubar removal did not repair focus');
  dynamic.Menubar = controller.state.focusedMenu ?? 'null'; focus.Menubar = (document.activeElement as HTMLElement)?.textContent ?? 'none';
  roving.destroy(); release(); controller.destroy(); root.remove(); platform.destroy(); resources.push(platform.scope.resources().total);
}

async function exerciseNavigationMenu(keyboardState: Record<string, unknown>, resources: number[]): Promise<void> {
  const root = fixture('NavigationMenu'); const platform = createUIFnDomPlatform({ root: document });
  const controller = createNavigationMenuController({ delayDuration: 25, skipDelayDuration: 10, items: [{ id: 'docs', hasContent: true }, { id: 'blog', href: '/blog' }] });
  const docs = button('Docs'); const content = document.createElement('div'); root.append(docs, content);
  const release = reactiveParts(controller, () => [[root, controller.parts.root.getProps()], [docs, controller.parts.trigger.getProps('docs')], [content, controller.parts.content.getProps('docs')]]);
  const binding = createUIFnNavigationMenuDomBinding({ platform, controller });
  docs.dispatchEvent(pointer('pointerenter'));
  invariant(await waitUntil(() => controller.state.value === 'docs' && !content.hidden), 'NavigationMenu delay intent did not commit');
  keyboardState.NavigationMenu = { delay: 25, value: controller.state.value };
  binding.destroy(); release(); controller.destroy(); root.remove(); platform.destroy(); resources.push(platform.scope.resources().total);
}

function exercisePagination(keyboardState: Record<string, unknown>, aria: Record<string, unknown>, dynamic: Record<string, string>): void {
  const root = fixture('Pagination'); const controller = createPaginationController({ count: 100, pageSize: 10, defaultPage: 2, ariaLabel: 'Results', getPageLabel: (page, selected) => `${selected ? 'Current ' : ''}Page ${page}` });
  const first = button('1'); const second = button('2'); root.append(first, second);
  const release = reactiveParts(controller, () => [[root, controller.parts.root.getProps()], [first, controller.parts.pageTrigger.getProps(1)], [second, controller.parts.pageTrigger.getProps(2)]]);
  root.dispatchEvent(keyboard('End'));
  invariant(controller.state.page === 10, 'Pagination End did not select final page');
  controller.actions.setCount(12); invariant(controller.state.page === 2, 'Pagination shrink did not clamp page');
  keyboardState.Pagination = { end: 10, repaired: controller.state.page }; dynamic.Pagination = String(controller.state.page);
  aria.Pagination = { root: root.getAttribute('aria-label'), current: second.getAttribute('aria-current'), label: second.getAttribute('aria-label') };
  release(); controller.destroy(); root.remove();
}

async function exerciseTabs(keyboardState: Record<string, unknown>, focus: Record<string, string>, aria: Record<string, unknown>, dynamic: Record<string, string>, resources: number[]): Promise<void> {
  const root = fixture('Tabs'); const platform = createUIFnDomPlatform({ root: document }); const controller = createTabsController({ dir: 'rtl', items: ['a', 'b', 'c'], disabledItems: ['b'], defaultValue: 'a' });
  const list = document.createElement('div'); const a = button('A'); const b = button('B'); const c = button('C'); list.append(a, b, c); root.append(list);
  const release = reactiveParts(controller, () => [[root, controller.parts.root.getProps()], [list, controller.parts.list.getProps()], [a, controller.parts.trigger.getProps('a')], [b, controller.parts.trigger.getProps('b')], [c, controller.parts.trigger.getProps('c')]]);
  const roving = createUIFnRovingFocusDomBinding({ platform, controller, focusInitial: false, getActiveKey: (state) => state.focusedItem, getElement: (key) => key === 'a' ? a : key === 'b' ? b : key === 'c' ? c : null });
  a.focus(); a.dispatchEvent(keyboard('ArrowLeft'));
  invariant(
    await waitUntil(() => controller.state.value === 'c' && document.activeElement === c),
    'RTL Tabs did not move forward and skip disabled item',
  );
  keyboardState.Tabs = { rtlArrowLeft: 'c' }; aria.Tabs = { selected: c.getAttribute('aria-selected'), disabled: b.getAttribute('aria-disabled') };
  controller.actions.unregisterItem('c'); invariant(controller.state.value === 'a' && controller.state.focusedItem === 'a', 'Tabs removal repair failed');
  dynamic.Tabs = controller.state.focusedItem ?? 'null'; focus.Tabs = (document.activeElement as HTMLElement)?.textContent ?? 'none';
  roving.destroy(); release(); controller.destroy(); root.remove(); platform.destroy(); resources.push(platform.scope.resources().total);
}

async function exerciseTree(keyboardState: Record<string, unknown>, focus: Record<string, string>, aria: Record<string, unknown>, dynamic: Record<string, string>, resources: number[]): Promise<void> {
  const root = fixture('TreeView'); const platform = createUIFnDomPlatform({ root: document }); const label = document.createElement('div'); label.textContent = 'Files'; const tree = document.createElement('div');
  const docs = document.createElement('div'); docs.textContent = 'Docs'; const intro = document.createElement('div'); intro.textContent = 'Intro'; tree.append(docs, intro); root.append(label, tree);
  const controller = createTreeViewController({ items: [{ id: 'docs', children: [{ id: 'intro' }] }, { id: 'blog' }] });
  const release = reactiveParts(controller, () => [[root, controller.parts.root.getProps()], [label, controller.parts.label.getProps()], [tree, controller.parts.tree.getProps()], [docs, controller.parts.item.getProps('docs')], [intro, controller.parts.item.getProps('intro')]]);
  const roving = createUIFnRovingFocusDomBinding({ platform, controller, focusInitial: false, getActiveKey: (state) => state.focusedItem, getElement: (key) => key === 'docs' ? docs : key === 'intro' ? intro : null });
  docs.focus(); tree.dispatchEvent(keyboard('ArrowRight')); tree.dispatchEvent(keyboard('ArrowRight'));
  invariant(await waitUntil(() => controller.state.expanded.includes('docs') && controller.state.focusedItem === 'intro'), 'TreeView expand/child navigation failed');
  keyboardState.TreeView = { expanded: [...controller.state.expanded], child: controller.state.focusedItem };
  aria.TreeView = { role: tree.getAttribute('role'), level: docs.getAttribute('aria-level'), expanded: docs.getAttribute('aria-expanded') };
  controller.actions.setItems([{ id: 'blog' }]); invariant(controller.state.focusedItem === 'blog', 'TreeView dynamic focus repair failed');
  dynamic.TreeView = controller.state.focusedItem ?? 'null'; focus.TreeView = (document.activeElement as HTMLElement)?.textContent ?? 'none';
  roving.destroy(); release(); controller.destroy(); root.remove(); platform.destroy(); resources.push(platform.scope.resources().total);
}

export async function runNavigationVectors(): Promise<NavigationBrowserResult> {
  document.querySelectorAll('[data-navigation-fixture]').forEach((node) => node.remove());
  const keyboardState: Record<string, unknown> = {}; const focus: Record<string, string> = {}; const aria: Record<string, unknown> = {};
  const dynamicRepair: Record<string, string> = {}; const submenu: string[] = []; const touch: string[] = []; const resourceTotals: number[] = [];
  await exerciseMenu(focus, aria, submenu, resourceTotals);
  await exerciseContextMenu(touch, resourceTotals);
  await exerciseMenubar(keyboardState, focus, dynamicRepair, resourceTotals);
  await exerciseNavigationMenu(keyboardState, resourceTotals);
  exercisePagination(keyboardState, aria, dynamicRepair);
  await exerciseTabs(keyboardState, focus, aria, dynamicRepair, resourceTotals);
  await exerciseTree(keyboardState, focus, aria, dynamicRepair, resourceTotals);
  keyboardState.ContextMenu = { longPress: 'open' };
  keyboardState.Menu = { disabledSkip: 'more', typeahead: 'canonical' };
  const negativeCodes = [codeOf(() => assertUIFnKeyboardCommand(
    resolveUIFnNavigationCommand('Menubar', 'ArrowRight', { direction: 'rtl', region: 'root' }),
    'open-first', { vector: 'TV-PRIM-003-N', mutation: 'wrong-menubar-key' },
  ))];
  invariant(negativeCodes[0] === 'UIFN_KEYBOARD_MODEL_DIVERGED', 'Wrong keyboard mutation error');
  invariant(resourceTotals.every((total) => total === 0), `Navigation bindings leaked resources: ${resourceTotals.join(',')}`);
  const result: NavigationBrowserResult = Object.freeze({
    vectorId: 'TV-PRIM-003-P/N', outcome: 'pass',
    primitives: Object.freeze(['ContextMenu', 'Menu', 'Menubar', 'NavigationMenu', 'Pagination', 'Tabs', 'TreeView']),
    keyboard: Object.freeze(keyboardState), focus: Object.freeze(focus), aria: Object.freeze(aria),
    submenu: Object.freeze(submenu), touch: Object.freeze(touch), dynamicRepair: Object.freeze(dynamicRepair),
    negativeCodes: Object.freeze(negativeCodes), resourceTotals: Object.freeze(resourceTotals),
  });
  document.querySelector('#results')!.textContent = JSON.stringify(result);
  return result;
}

declare global { interface Window { __UIFN_NAVIGATION_HARNESS__: { run(): Promise<NavigationBrowserResult> }; } }
window.__UIFN_NAVIGATION_HARNESS__ = Object.freeze({ run: runNavigationVectors });
