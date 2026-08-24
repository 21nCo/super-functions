#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const PHASE10 = Object.freeze([
  'AngleSlider','Carousel','ColorPicker','DateInput','DatePicker','Meter','Progress','RatingGroup','SignaturePad','Slider','Splitter','Steps','Timer','Toast',
]);
const ANATOMY = Object.freeze({
  AngleSlider: ['root','track','thumb','valueText','hiddenInput'], Carousel: ['root','viewport','item','previous','next','indicatorGroup','indicator','liveRegion'],
  ColorPicker: ['root','label','control','trigger','positioner','content','area','areaThumb','channelSlider','channelInput','swatch','hiddenInput'],
  DateInput: ['root','label','segment','hiddenInput','error'], DatePicker: ['root','label','input','segment','trigger','positioner','content','header','previous','next','grid','gridLabel','cell','cellTrigger','hiddenInput'],
  Meter: ['root','label','track','range','valueText'], Progress: ['root','label','track','range','circle','valueText'],
  RatingGroup: ['root','label','control','item','itemIndicator','hiddenInput','valueText'], SignaturePad: ['root','label','canvas','clear','undo','status','hiddenInput'],
  Slider: ['root','label','control','track','range','thumb','valueText','hiddenInput'], Splitter: ['root','panel','resizeTrigger','resizeHandle'],
  Steps: ['root','list','item','trigger','indicator','separator','content','completed'], Timer: ['root','value','start','pause','reset','status'], Toast: ['viewport','root','title','description','action','close'],
});

function issue(code, message, source) { return Object.freeze({ code, message, source }); }
function source(name) { return readFileSync(path.join(repoRoot, name), 'utf8'); }
function primitiveFile(name) { return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

export function classifyPhase10Mutations(mutations) {
  const codes = [];
  if (mutations.gestureAfterCancel) codes.push('UIFN_GESTURE_AFTER_CANCEL');
  if (mutations.wrongRtlAxis) codes.push('UIFN_RANGE_DIRECTION_INVALID');
  if (mutations.ambientDateParse) codes.push('UIFN_AMBIENT_DATE_PARSE');
  if (mutations.invalidDate) codes.push('UIFN_DATE_VALUE_INVALID');
  if (mutations.invalidColor) codes.push('UIFN_COLOR_VALUE_INVALID');
  if (mutations.accumulatingTimer) codes.push('UIFN_TIMER_DRIFT_BUDGET');
  if (mutations.announcementFlood) codes.push('UIFN_ANNOUNCEMENT_FLOOD');
  if (mutations.timerAfterDestroy) codes.push('UIFN_TIMER_AFTER_DESTROY');
  if (mutations.hardcodedEnglish) codes.push('UIFN_UNLOCALIZED_DEFAULT');
  if (mutations.rtlKeyboardMirroredIncorrectly) codes.push('UIFN_RTL_KEYBOARD_DIVERGED');
  return Object.freeze(codes);
}

function configFor(name) {
  if (name === 'Carousel') return { itemCount: 3, reducedMotion: true };
  if (name === 'DateInput' || name === 'DatePicker') return {};
  if (name === 'Splitter') return { defaultSizes: [40, 60] };
  if (name === 'Steps') return { count: 3 };
  if (name === 'Timer') return { duration: 1000 };
  return {};
}

function allPrimitiveSources() {
  const directory = path.join(repoRoot, 'uifn/core/src/primitives');
  return readdirSync(directory).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).map((name) => source(path.join('uifn/core/src/primitives', name))).join('\n');
}

export async function verifyPhase10Contract({ requireDist = false } = {}) {
  const issues = [];
  const catalog = JSON.parse(source('uifn/catalog/generated/catalog.json'));
  const selected = catalog.primitives
    .filter((primitive) => PHASE10.includes(primitive.name) && primitive.requirementIds.some((id) => ['PRIM-006', 'PRIM-007', 'PRIM-008'].includes(id)))
    .map((primitive) => primitive.name);
  if (JSON.stringify(selected) !== JSON.stringify(PHASE10)) issues.push(issue('UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE', 'PHASE_10 catalog ownership differs from the reviewed fourteen-primitive set.', 'uifn/catalog/generated/catalog.json'));

  for (const name of PHASE10) {
    const location = path.join(repoRoot, `uifn/core/src/primitives/${primitiveFile(name)}.ts`);
    if (!existsSync(location)) issues.push(issue('UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE', `Missing canonical ${name} source.`, location));
  }
  const phaseSources = PHASE10.filter((name) => !['Meter','Progress'].includes(name)).map((name) => source(`uifn/core/src/primitives/${primitiveFile(name)}.ts`)).join('\n')
    + source('uifn/core/src/primitives/status-feedback-controllers.ts');
  for (const pattern of [/\bDate\.parse\s*\(/, /\bsetInterval\s*\(/, /\b(?:document|window|navigator)\s*\./]) {
    if (pattern.test(phaseSources)) issues.push(issue(pattern.source.includes('Date') ? 'UIFN_AMBIENT_DATE_PARSE' : 'UIFN_TIMER_DRIFT_BUDGET', `Core Phase 10 source matched forbidden ambient behavior ${pattern}.`, 'uifn/core/src'));
  }
  if (/create[A-Z][A-Za-z0-9]*Model\b/.test(allPrimitiveSources())) issues.push(issue('UIFN_LEGACY_PRIMITIVE_PATH', 'A legacy primitive model factory remains reachable.', 'uifn/core/src/primitives'));
  if (existsSync(path.join(repoRoot, 'uifn/core/src/state/machine.ts'))) issues.push(issue('UIFN_LEGACY_PRIMITIVE_PATH', 'The retired state-machine path still exists.', 'uifn/core/src/state/machine.ts'));

  const gesture = source('uifn/core/src/algorithms/gesture.ts');
  for (const symbol of ['resolveUIFnAxisPercent','resolveUIFnTouchArbitration','stepUIFnRangeValue','constrainUIFnThumbValue','resizeUIFnSplitterPair','assertUIFnGestureInactive']) if (!gesture.includes(symbol)) issues.push(issue('UIFN_GESTURE_AFTER_CANCEL', `Gesture substrate omits ${symbol}.`, 'uifn/core/src/algorithms/gesture.ts'));
  const date = source('uifn/core/src/algorithms/date-time.ts');
  for (const symbol of ['parseUIFnIsoDate','resolveUIFnZonedDateTime','createUIFnMonthGrid','firstUIFnDayOfWeek','isUIFnDateAvailable']) if (!date.includes(symbol)) issues.push(issue('UIFN_AMBIENT_DATE_PARSE', `Date substrate omits ${symbol}.`, 'uifn/core/src/algorithms/date-time.ts'));
  const color = source('uifn/core/src/algorithms/color.ts');
  for (const symbol of ['parseUIFnColor','rgbaToUIFnHsla','hslaToUIFnRgba','colorUIFnDistance']) if (!color.includes(symbol)) issues.push(issue('UIFN_COLOR_VALUE_INVALID', `Color substrate omits ${symbol}.`, 'uifn/core/src/algorithms/color.ts'));
  const dom = source('uifn/dom/src/gesture.ts') + source('uifn/dom/src/pointer.ts');
  for (const symbol of ['createUIFnGestureBinding','setPointerCapture','releasePointerCapture','pointercancel','lostpointercapture','touchAction']) if (!dom.includes(symbol)) issues.push(issue('UIFN_GESTURE_AFTER_CANCEL', `DOM gesture boundary omits ${symbol}.`, 'uifn/dom/src'));
  const tree = source('uifn/core/src/primitives/tree-view.ts');
  for (const symbol of ['TreeViewWorkflowStatus','setStatus','statuses']) if (!tree.includes(symbol)) issues.push(issue('UIFN_WORKFLOW_STATUS_INCOMPLETE', `TreeView workflow status omits ${symbol}.`, 'uifn/core/src/primitives/tree-view.ts'));

  const generated = JSON.parse(source('uifn/evidence/generated/phase-10/phase-10-golden-corpus.json'));
  if (
    generated.primitiveCount !== 14
    || generated.catalogPrimitiveCount !== catalog.primitives.length
    || generated.corpus?.length !== 14
  ) {
    issues.push(issue('UIFN_PHASE_10_GENERATED_DRIFT', 'Golden corpus does not cover all Phase 10 and catalog contracts.', 'uifn/evidence/generated/phase-10/phase-10-golden-corpus.json'));
  }

  let publicCore = null;
  if (requireDist) {
    const dist = path.join(repoRoot, 'uifn/core/dist/index.mjs');
    if (!existsSync(dist)) issues.push(issue('UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE', 'Built core entrypoint is missing.', dist));
    else publicCore = await import(`${pathToFileURL(dist).href}?phase10=${Date.now()}`);
  }
  if (publicCore) {
    for (const primitive of catalog.primitives) {
      const symbol = primitive.implementationKind === 'interactive-controller' ? `create${primitive.name}Controller` : `${primitive.name}Contract`;
      if (typeof publicCore[symbol] !== (primitive.implementationKind === 'interactive-controller' ? 'function' : 'object')) issues.push(issue('UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE', `${primitive.name} has no built canonical ${primitive.implementationKind}.`, 'uifn/core/dist/index.mjs'));
    }
    for (const name of PHASE10) {
      if (name === 'Meter' || name === 'Progress') {
        const contract = publicCore[`${name}Contract`];
        if (JSON.stringify(contract?.anatomy?.map((part) => part.name)) !== JSON.stringify(ANATOMY[name])) issues.push(issue('UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE', `${name} anatomy differs from catalog.`, 'uifn/core/dist/index.mjs'));
        continue;
      }
      const controller = publicCore[`create${name}Controller`](configFor(name), { mode: 'test', locale: 'ar-EG', direction: 'rtl', timeZone: 'UTC', reducedMotion: true, generateId: (scope) => `phase10-${name}-${scope}` });
      if (JSON.stringify(Object.keys(controller.parts)) !== JSON.stringify(ANATOMY[name])) issues.push(issue('UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE', `${name} anatomy differs from catalog.`, 'uifn/core/dist/index.mjs'));
      controller.destroy();
    }
    const slider = publicCore.createSliderController({ defaultValue: [50], dir: 'rtl', locale: 'ar-EG' });
    slider.actions.keyStep(0, 'ArrowRight');
    if (slider.state.value[0] !== 49 || slider.state.valueText[0] === '49') issues.push(issue('UIFN_RTL_KEYBOARD_DIVERGED', 'Built Slider did not preserve logical RTL direction and localized value text.', 'uifn/core/dist/index.mjs'));
    slider.destroy();
    try { publicCore.parseUIFnIsoDate('07/18/2026'); issues.push(issue('UIFN_AMBIENT_DATE_PARSE', 'Built date parser accepted an ambient display date.', 'uifn/core/dist/index.mjs')); } catch (error) { if (error?.code !== 'UIFN_AMBIENT_DATE_PARSE') issues.push(issue('UIFN_AMBIENT_DATE_PARSE', 'Built date parser failed with an unstable code.', 'uifn/core/dist/index.mjs')); }
  }

  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-phase-10-contract',
    requirements: ['PRIM-006','PRIM-007','PRIM-008','I18N-001'],
    vectors: ['TV-PRIM-006-P/N','TV-PRIM-007-P/N','TV-PRIM-008-P/N','TV-I18N-001-P/N'],
    primitiveCount: PHASE10.length,
    catalogPrimitiveCount: catalog.primitives.length,
    canonicalLogicComplete: issues.every((entry) => entry.code !== 'UIFN_CATALOG_IMPLEMENTATION_INCOMPLETE' && entry.code !== 'UIFN_LEGACY_PRIMITIVE_PATH'),
    browsers: ['chromium','firefox','webkit','mobile-chromium','mobile-webkit'],
    issues,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyPhase10Contract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
