#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;
if (!mode) { console.error('Usage: node scripts/generate-uifn-phase-08.mjs (--write|--check)'); process.exit(2); }
const outputRoot = path.resolve(process.cwd(), 'uifn/.conduct/generated/phase-08');
const primitives = [
  { name: 'ContextMenu', factory: 'createContextMenuController', parts: ['root','trigger','positioner','content','item','itemIndicator','separator','group','groupLabel','submenuTrigger','submenuContent'] },
  { name: 'Menu', factory: 'createMenuController', parts: ['root','trigger','positioner','content','item','itemIndicator','separator','group','groupLabel','submenuTrigger','submenuContent'] },
  { name: 'Menubar', factory: 'createMenubarController', parts: ['root','menu','trigger','content','item','submenuTrigger','submenuContent'] },
  { name: 'NavigationMenu', factory: 'createNavigationMenuController', parts: ['root','list','item','trigger','content','link','viewport','indicator'] },
  { name: 'Pagination', factory: 'createPaginationController', parts: ['root','list','item','pageTrigger','previous','next','ellipsis'] },
  { name: 'Tabs', factory: 'createTabsController', parts: ['root','list','trigger','content','indicator'] },
  { name: 'TreeView', factory: 'createTreeViewController', parts: ['root','label','tree','item','itemTrigger','itemText','branch','indicator'] },
];
const keyboardModels = {
  ContextMenu: { region: 'content', axes: ['vertical','logical-horizontal'], typeahead: true, nested: true },
  Menu: { region: 'content', axes: ['vertical','logical-horizontal'], typeahead: true, nested: true },
  Menubar: { region: 'root-and-content', axes: ['logical-horizontal','vertical'], typeahead: true, rtlVerticalInvariant: true },
  NavigationMenu: { region: 'root-and-content', axes: ['orientation','logical-horizontal'], delayedIntent: true },
  Pagination: { region: 'root', axes: ['logical-horizontal'], nativeNavigation: true },
  Tabs: { region: 'root', axes: ['orientation','logical-horizontal'], activationModes: ['automatic','manual'] },
  TreeView: { region: 'tree', axes: ['vertical','logical-hierarchy'], typeahead: true, dynamicHierarchy: true },
};
const header = { schemaVersion: 1, generatedBy: 'generate-uifn-phase-08.mjs', phase: 'PHASE_08', implementationEvidence: true };
const outputs = {
  'phase-08-exports.json': `${JSON.stringify({ ...header, primitives }, null, 2)}\n`,
  'phase-08-keyboard-models.json': `${JSON.stringify({ ...header, keyboardModels }, null, 2)}\n`,
  'phase-08-test-manifest.json': `${JSON.stringify({
    ...header, requirement: 'PRIM-003', vectors: ['TV-PRIM-003-P','TV-PRIM-003-N','TV-DOM-002-P/N','TV-DOM-003-P/N','TV-DOM-005-P/N','TV-DOM-006-P/N'],
    browsers: ['chromium','firefox','webkit','mobile-chromium','mobile-webkit'], frameworks: ['react','svelte','solid'], modes: ['package','source'],
    suites: ['uifn/core/src/__tests__/phase-08-navigation.test.ts','uifn/dom/browser/navigation-primitives.spec.ts','scripts/verify-uifn-phase-08-contract.test.mjs','scripts/verify-uifn-navigation-pack.mjs'],
  }, null, 2)}\n`,
};

try {
  if (mode === 'write') {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all(Object.entries(outputs).map(([name, contents]) => writeFile(path.join(outputRoot, name), contents, 'utf8')));
  } else {
    for (const [name, expected] of Object.entries(outputs)) {
      const actual = await readFile(path.join(outputRoot, name), 'utf8');
      const equal = name.endsWith('.json') ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected)) : actual === expected;
      if (!equal) throw new Error(`UIFN_PHASE_08_GENERATED_DRIFT: ${name}`);
    }
  }
  console.log(JSON.stringify({ ok: true, command: `generate:uifn-phase-08:${mode}`, outputCount: Object.keys(outputs).length, primitiveCount: primitives.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: `generate:uifn-phase-08:${mode}`, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
