#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;
if (!mode) { console.error('Usage: node scripts/generate-uifn-phase-07.mjs (--write|--check)'); process.exit(2); }
const outputRoot = path.resolve(process.cwd(), 'uifn/evidence/generated/phase-07');
const primitives = [
  { name: 'AlertDialog', factory: 'createAlertDialogController', parts: ['root','trigger','portal','backdrop','positioner','content','title','description','cancel','action','close'] },
  { name: 'Dialog', factory: 'createDialogController', parts: ['root','trigger','portal','backdrop','positioner','content','title','description','close'] },
  { name: 'Drawer', factory: 'createDrawerController', parts: ['root','trigger','portal','backdrop','positioner','content','handle','title','description','close'] },
  { name: 'FloatingPanel', factory: 'createFloatingPanelController', parts: ['root','trigger','positioner','content','header','title','description','dragHandle','resizeHandle','close'] },
  { name: 'HoverCard', factory: 'createHoverCardController', parts: ['root','trigger','positioner','content','arrow'] },
  { name: 'Popover', factory: 'createPopoverController', parts: ['root','anchor','trigger','positioner','content','title','description','arrow','close'] },
  { name: 'Tooltip', factory: 'createTooltipController', parts: ['root','trigger','positioner','content','arrow'] },
  { name: 'Tour', factory: 'createTourController', parts: ['root','portal','backdrop','spotlight','positioner','content','title','description','previous','next','skip','close','progress'] },
];
const policies = {
  AlertDialog: { modalDefault: true, initialFocus: 'cancel', outside: 'prevent', interaction: 'press', touchOpens: true, nameRule: 'title-or-aria-label-required', position: 'none' },
  Dialog: { modalDefault: true, initialFocus: 'first-tabbable', outside: 'pointer-dismiss', interaction: 'press', touchOpens: true, nameRule: 'title-or-aria-label-required', position: 'none' },
  Drawer: { modalDefault: true, initialFocus: 'first-tabbable', outside: 'pointer-dismiss', interaction: 'press-drag', touchOpens: true, nameRule: 'title-or-aria-label-required', position: 'none' },
  FloatingPanel: { modalDefault: false, initialFocus: 'content', outside: 'retain', interaction: 'press-drag-resize', touchOpens: true, nameRule: 'title-or-aria-label-required', position: 'anchor' },
  HoverCard: { modalDefault: false, initialFocus: 'none', outside: 'dismiss', interaction: 'hover-focus-hoverable-content', touchOpens: false, nameRule: 'trigger-owned', position: 'anchor' },
  Popover: { modalDefault: false, initialFocus: 'content', outside: 'dismiss', interaction: 'press', touchOpens: true, nameRule: 'title-or-aria-label-required', position: 'anchor' },
  Tooltip: { modalDefault: false, initialFocus: 'none', outside: 'retain', interaction: 'hover-focus-noninteractive', touchOpens: false, nameRule: 'tooltip-description-required', position: 'anchor' },
  Tour: { modalDefault: true, initialFocus: 'next', outside: 'prevent', interaction: 'tour', touchOpens: true, nameRule: 'title-or-aria-label-required', position: 'target' },
};
const header = { schemaVersion: 1, generatedBy: 'generate-uifn-phase-07.mjs', phase: 'PHASE_07', implementationEvidence: true };
const outputs = {
  'phase-07-exports.json': `${JSON.stringify({ ...header, primitives }, null, 2)}\n`,
  'phase-07-policies.json': `${JSON.stringify({ ...header, policies }, null, 2)}\n`,
  'phase-07-test-manifest.json': `${JSON.stringify({
    ...header,
    requirement: 'PRIM-002',
    vectors: ['TV-PRIM-002-P','TV-PRIM-002-N','TV-DOM-002-P/N','TV-DOM-003-P/N','TV-DOM-004-P/N','TV-DOM-005-P/N','TV-DOM-006-P/N'],
    browsers: ['chromium','firefox','webkit','mobile-chromium','mobile-webkit'], frameworks: ['react','svelte','solid'], modes: ['package','source'],
    suites: ['uifn/core/src/__tests__/phase-07-overlays.test.ts','uifn/dom/browser/overlay-primitives.spec.ts','scripts/verify-uifn-phase-07-contract.test.mjs','scripts/verify-uifn-overlay-pack.mjs'],
  }, null, 2)}\n`,
};

try {
  if (mode === 'write') {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all(Object.entries(outputs).map(([name, contents]) => writeFile(path.join(outputRoot, name), contents, 'utf8')));
  } else {
    for (const [name, expected] of Object.entries(outputs)) {
      const actual = await readFile(path.join(outputRoot, name), 'utf8');
      const equal = name.endsWith('.json')
        ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected))
        : actual === expected;
      if (!equal) throw new Error(`UIFN_PHASE_07_GENERATED_DRIFT: ${name}`);
    }
  }
  console.log(JSON.stringify({ ok: true, command: `generate:uifn-phase-07:${mode}`, outputCount: Object.keys(outputs).length, primitiveCount: primitives.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: `generate:uifn-phase-07:${mode}`, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
