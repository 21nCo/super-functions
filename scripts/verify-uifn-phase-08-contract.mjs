#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const PRIMITIVES = Object.freeze(['ContextMenu','Menu','Menubar','NavigationMenu','Pagination','Tabs','TreeView']);
const FACTORIES = Object.freeze(['createContextMenuController','createMenuController','createMenubarController','createNavigationMenuController','createPaginationController','createTabsController','createTreeViewController']);
const FILES = Object.freeze(['context-menu','menu','menubar','navigation-menu','pagination','tabs','tree-view']);
const ANATOMY = Object.freeze({
  ContextMenu: ['root','trigger','positioner','content','item','itemIndicator','separator','group','groupLabel','submenuTrigger','submenuContent'],
  Menu: ['root','trigger','positioner','content','item','itemIndicator','separator','group','groupLabel','submenuTrigger','submenuContent'],
  Menubar: ['root','menu','trigger','content','item','submenuTrigger','submenuContent'],
  NavigationMenu: ['root','list','item','trigger','content','link','viewport','indicator'],
  Pagination: ['root','list','item','pageTrigger','previous','next','ellipsis'],
  Tabs: ['root','list','trigger','content','indicator'],
  TreeView: ['root','label','tree','item','itemTrigger','itemText','branch','indicator'],
});
function issue(code, message, source) { return Object.freeze({ code, message, source }); }

export function classifyPhase08Mutations(mutations) {
  const codes = [];
  if (mutations.wrongMenubarRtlDown || mutations.wrongDirectionalKey || mutations.localKeyMap) codes.push('UIFN_KEYBOARD_MODEL_DIVERGED');
  if (mutations.removeActiveWithoutRepair || mutations.disableActiveWithoutRepair) codes.push('UIFN_NAVIGATION_FOCUS_REPAIR_MISSING');
  if (mutations.localCollection || mutations.localTypeahead || mutations.localRoving) codes.push('UIFN_NAVIGATION_POLICY_FORK');
  if (mutations.submenuGraceMissing || mutations.submenuFocusReturnMissing) codes.push('UIFN_SUBMENU_GRACE_INVALID');
  if (mutations.resourceLeak) codes.push('UIFN_NAVIGATION_RESOURCE_LEAK');
  return Object.freeze(codes);
}

export async function verifyPhase08Contract({ requireDist = false } = {}) {
  const issues = [];
  const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
  const selected = catalog.primitives.filter((primitive) => primitive.requirementIds.includes('PRIM-003')).map((primitive) => primitive.name);
  if (JSON.stringify(selected) !== JSON.stringify(PRIMITIVES)) issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', 'PHASE_08 catalog ownership differs from the reviewed seven-primitive set.', 'uifn/catalog/generated/catalog.json'));
  const sources = Object.fromEntries(FILES.map((file) => {
    const location = path.join(repoRoot, `uifn/core/src/primitives/${file}.ts`);
    if (!existsSync(location)) issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Missing ${file} controller source.`, location));
    return [file, existsSync(location) ? readFileSync(location, 'utf8') : ''];
  }));
  for (const removed of ['dropdown-menu.ts','menu-bar.ts']) if (existsSync(path.join(repoRoot, 'uifn/core/src/primitives', removed))) {
    issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Legacy navigation source ${removed} remains.`, `uifn/core/src/primitives/${removed}`));
  }
  const combined = Object.values(sources).join('\n');
  for (const symbol of ['resolveUIFnPrimitiveKey','repairUIFnNavigationKey','createUIFnNavigationCollection']) if (!combined.includes(symbol)) {
    issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Navigation controllers omit canonical ${symbol}.`, 'uifn/core/src/primitives'));
  }
  for (const pattern of [/utils\/roving-focus/, /create(?:DropdownMenu|MenuBar|Tabs|ContextMenu)Model/, /\b(?:document|window)\s*\./, /\bsetTimeout\s*\(/]) {
    if (pattern.test(combined)) issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Core navigation source matched forbidden local behavior ${pattern}.`, 'uifn/core/src/primitives'));
  }
  const policySource = readFileSync(path.join(repoRoot, 'uifn/core/src/algorithms/navigation.ts'), 'utf8');
  for (const symbol of ['UIFN_NAVIGATION_KEY_TABLES','resolveUIFnNavigationCommand','assertUIFnKeyboardCommand']) if (!policySource.includes(symbol)) {
    issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Canonical keyboard module omits ${symbol}.`, 'uifn/core/src/algorithms/navigation.ts'));
  }
  const domSource = readFileSync(path.join(repoRoot, 'uifn/dom/src/navigation.ts'), 'utf8');
  for (const symbol of ['platform.layers','platform.focusScopes','createUIFnPositioner','createUIFnPortal','createUIFnPresence','isUIFnPointInPointerGraceTriangle','createUIFnRovingFocusDomBinding','pointerType !== \'touch\'']) if (!domSource.includes(symbol)) {
    issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Navigation DOM binding omits shared behavior ${symbol}.`, 'uifn/dom/src/navigation.ts'));
  }
  let publicCore = null;
  if (requireDist) {
    const dist = path.join(repoRoot, 'uifn/core/dist/index.mjs');
    if (!existsSync(dist)) issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', 'Built core entrypoint is missing.', dist));
    else publicCore = await import(`${pathToFileURL(dist).href}?phase08=${Date.now()}`);
  }
  if (publicCore) {
    for (const factory of FACTORIES) if (typeof publicCore[factory] !== 'function') issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `Public core omits ${factory}.`, 'uifn/core/dist/index.mjs'));
    const configs = {
      ContextMenu: { items: [{ id: 'a' }] }, Menu: { items: [{ id: 'a' }] },
      Menubar: { items: [{ id: 'a' }, { id: 'child', parentId: 'a' }] },
      NavigationMenu: { items: [{ id: 'a', hasContent: true }] }, Pagination: { count: 100 },
      Tabs: { items: ['a','b'], defaultValue: 'a' }, TreeView: { items: [{ id: 'a' }] },
    };
    for (const name of PRIMITIVES) {
      const controller = publicCore[FACTORIES[PRIMITIVES.indexOf(name)]](configs[name], { generateId: (scope) => `phase08-${name}-${scope}` });
      if (JSON.stringify(Object.keys(controller.parts)) !== JSON.stringify(ANATOMY[name])) issues.push(issue('UIFN_NAVIGATION_POLICY_FORK', `${name} anatomy differs from contract.`, 'uifn/core/dist/index.mjs'));
      controller.destroy();
    }
    const rtlDown = publicCore.resolveUIFnNavigationCommand('Menubar','ArrowDown',{ direction: 'rtl', region: 'root' });
    if (rtlDown !== 'open-first') issues.push(issue('UIFN_KEYBOARD_MODEL_DIVERGED', 'RTL Menubar ArrowDown was incorrectly mirrored.', 'uifn/core/dist/index.mjs'));
    const tabs = publicCore.createTabsController({ items: ['a','b','c'], defaultValue: 'b' });
    tabs.actions.unregisterItem('b');
    if (tabs.state.focusedItem !== 'c' || tabs.state.value !== 'c') issues.push(issue('UIFN_NAVIGATION_FOCUS_REPAIR_MISSING', 'Tabs removal did not repair the prior logical slot.', 'uifn/core/dist/index.mjs'));
    tabs.destroy();
  }
  return Object.freeze({ ok: issues.length === 0, command: 'verify:uifn-phase-08-contract', requirement: 'PRIM-003', vectors: ['TV-PRIM-003-P','TV-PRIM-003-N'], primitiveCount: selected.length, keyboardTableCount: PRIMITIVES.length, issues });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyPhase08Contract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2)); process.exit(result.ok ? 0 : 1);
}
