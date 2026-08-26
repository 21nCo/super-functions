#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const PRIMITIVES = Object.freeze(['AlertDialog','Dialog','Drawer','FloatingPanel','HoverCard','Popover','Tooltip','Tour']);
const FACTORIES = Object.freeze(PRIMITIVES.map((name) => `create${name}Controller`));
const FILES = Object.freeze(['alert-dialog','dialog','drawer','floating-panel','hover-card','popover','tooltip','tour']);
const ANATOMY = Object.freeze({
  AlertDialog: ['root','trigger','portal','backdrop','positioner','content','title','description','cancel','action','close'],
  Dialog: ['root','trigger','portal','backdrop','positioner','content','title','description','close'],
  Drawer: ['root','trigger','portal','backdrop','positioner','content','handle','title','description','close'],
  FloatingPanel: ['root','trigger','positioner','content','header','title','description','dragHandle','resizeHandle','close'],
  HoverCard: ['root','trigger','positioner','content','arrow'],
  Popover: ['root','anchor','trigger','positioner','content','title','description','arrow','close'],
  Tooltip: ['root','trigger','positioner','content','arrow'],
  Tour: ['root','portal','backdrop','spotlight','positioner','content','title','description','previous','next','skip','close','progress'],
});

function issue(code, message, source) { return Object.freeze({ code, message, source }); }

export function classifyPhase07Mutations(mutations) {
  const codes = [];
  if (mutations.alertOutsideDismiss) codes.push('UIFN_ALERT_DIALOG_DISMISSAL');
  if (mutations.alertTitleMissing || mutations.dialogNameMissing) codes.push('UIFN_ACCESSIBLE_NAME_MISSING');
  if (mutations.localPositioner || mutations.localFocusTrap || mutations.localPresence || mutations.localPortal || mutations.localScrollLock) codes.push('UIFN_OVERLAY_POLICY_FORK');
  if (mutations.tooltipTouchOpens || mutations.tooltipFocusDelayed || mutations.tooltipReplacesName) codes.push('UIFN_TOOLTIP_INTERACTION_INVALID');
  if (mutations.resourceLeak) codes.push('UIFN_OVERLAY_RESOURCE_LEAK');
  return Object.freeze(codes);
}

export async function verifyPhase07Contract({ requireDist = false } = {}) {
  const issues = [];
  const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
  const selected = catalog.primitives.filter((primitive) => primitive.requirementIds.includes('PRIM-002')).map((primitive) => primitive.name);
  if (JSON.stringify(selected) !== JSON.stringify(PRIMITIVES)) {
    issues.push(issue('UIFN_OVERLAY_POLICY_FORK', 'PHASE_07 catalog ownership is not the reviewed eight-primitive set.', 'uifn/catalog/generated/catalog.json'));
  }
  const coreSources = FILES.map((file) => {
    const source = path.join(repoRoot, `uifn/core/src/primitives/${file}.ts`);
    if (!existsSync(source)) issues.push(issue('UIFN_OVERLAY_POLICY_FORK', `Missing ${file} controller source.`, source));
    return existsSync(source) ? readFileSync(source, 'utf8') : '';
  }).join('\n');
  const overlaySource = readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/overlay.ts'), 'utf8');
  const forbiddenCore = [
    /utils\/(?:position|presence|portal|focus-trap|outside-click|escape-key)/,
    /\bcomputePosition\s*\(/,
    /\bcreatePresenceManager\s*\(/,
    /\bcreateFocusTrapState\s*\(/,
    /\b(?:document|window)\s*\./,
    /\bsetTimeout\s*\(/,
  ];
  for (const pattern of forbiddenCore) {
    if (pattern.test(`${coreSources}\n${overlaySource}`)) issues.push(issue('UIFN_OVERLAY_POLICY_FORK', `Core overlay source matched forbidden local DOM behavior ${pattern}.`, 'uifn/core/src/primitives'));
  }
  if (/create(?:AlertDialog|Dialog|Popover|Tooltip|HoverCard)Model/.test(coreSources)) {
    issues.push(issue('UIFN_OVERLAY_POLICY_FORK', 'Legacy overlay model factories remain reachable.', 'uifn/core/src/primitives'));
  }
  const domSource = readFileSync(path.join(repoRoot, 'uifn/dom/src/overlay.ts'), 'utf8');
  for (const symbol of ['createUIFnPortal','createUIFnPositioner','createUIFnPresence','platform.layers','platform.focusScopes','platform.modals']) {
    if (!domSource.includes(symbol)) issues.push(issue('UIFN_OVERLAY_POLICY_FORK', `DOM binding omits shared service ${symbol}.`, 'uifn/dom/src/overlay.ts'));
  }
  const focusSource = readFileSync(path.join(repoRoot, 'uifn/dom/src/focus-scope.ts'), 'utf8');
  if (!focusSource.includes('addBranch(element') || !focusSource.includes('pathIncludesScope')) {
    issues.push(issue('UIFN_OVERLAY_POLICY_FORK', 'Focus scopes do not support portaled/shadow branches.', 'uifn/dom/src/focus-scope.ts'));
  }
  let publicCore = null;
  if (requireDist) {
    const dist = path.join(repoRoot, 'uifn/core/dist/index.mjs');
    if (!existsSync(dist)) issues.push(issue('UIFN_OVERLAY_POLICY_FORK', 'Built core entrypoint is missing.', dist));
    else publicCore = await import(`${pathToFileURL(dist).href}?phase07=${Date.now()}`);
  }
  if (publicCore) {
    for (const factory of FACTORIES) if (typeof publicCore[factory] !== 'function') {
      issues.push(issue('UIFN_OVERLAY_POLICY_FORK', `Public core omits ${factory}.`, 'uifn/core/dist/index.mjs'));
    }
    const configs = {
      AlertDialog: {}, Dialog: {}, Drawer: {}, FloatingPanel: {}, HoverCard: {}, Popover: {}, Tooltip: {},
      Tour: { steps: [{ id: 'one', title: 'One', target: '#one' }] },
    };
    for (const name of PRIMITIVES) {
      const controller = publicCore[`create${name}Controller`](configs[name], { generateId: (scope) => `phase07-${scope}` });
      if (JSON.stringify(Object.keys(controller.parts)) !== JSON.stringify(ANATOMY[name])) {
        issues.push(issue('UIFN_OVERLAY_POLICY_FORK', `${name} anatomy differs from the generated contract.`, 'uifn/core/dist/index.mjs'));
      }
      if (controller.state.policy.primitive !== name || controller.state.policy.portal !== true || controller.state.policy.presence !== true) {
        issues.push(issue('UIFN_OVERLAY_POLICY_FORK', `${name} lacks canonical policy identity/portal/presence.`, 'uifn/core/dist/index.mjs'));
      }
      controller.destroy();
    }
    let rejectedAlertOutsideDismiss = false;
    try { publicCore.createAlertDialogController({ closeOnInteractOutside: true }); }
    catch (error) {
      rejectedAlertOutsideDismiss = true;
      if (error.code !== 'UIFN_ALERT_DIALOG_DISMISSAL') issues.push(issue('UIFN_ALERT_DIALOG_DISMISSAL', 'AlertDialog emitted the wrong outside-dismiss code.', 'uifn/core/dist/index.mjs'));
    }
    if (!rejectedAlertOutsideDismiss) {
      issues.push(issue('UIFN_ALERT_DIALOG_DISMISSAL', 'AlertDialog accepted forbidden outside dismissal.', 'uifn/core/dist/index.mjs'));
    }
    const tooltip = publicCore.createTooltipController({ openDelay: 0 });
    tooltip.actions.onTriggerPointerEnter('touch');
    if (tooltip.state.open) issues.push(issue('UIFN_TOOLTIP_INTERACTION_INVALID', 'Tooltip opened from touch hover.', 'uifn/core/dist/index.mjs'));
    tooltip.actions.onTriggerFocus();
    if (!tooltip.state.open) issues.push(issue('UIFN_TOOLTIP_INTERACTION_INVALID', 'Tooltip focus did not open immediately.', 'uifn/core/dist/index.mjs'));
    tooltip.destroy();
  }
  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-phase-07-contract',
    requirement: 'PRIM-002',
    vectors: ['TV-PRIM-002-P','TV-PRIM-002-N','TV-DOM-002-P/N','TV-DOM-003-P/N','TV-DOM-004-P/N','TV-DOM-005-P/N','TV-DOM-006-P/N'],
    primitiveCount: selected.length,
    policyCount: PRIMITIVES.length,
    issues,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyPhase07Contract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
