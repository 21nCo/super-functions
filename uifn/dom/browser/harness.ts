import {
  createUIFnDismissableLayerStack,
  createUIFnDomScope,
  createUIFnFocusScopeManager,
  createUIFnFormBridge,
  createUIFnInputModality,
  createUIFnLiveRegion,
  createUIFnModalManager,
  createUIFnPointAnchor,
  createUIFnPortal,
  createUIFnPositioner,
  createUIFnPresence,
  getUIFnTabbable,
  type UIFnDomScope,
} from '@uifn/dom';

interface BrowserVectorResult {
  readonly vectorId: string;
  readonly requirement: string;
  readonly outcome: 'pass';
  readonly negativeCodes: readonly string[];
  readonly details: Readonly<Record<string, unknown>>;
  readonly resources: Readonly<Record<string, number>>;
}

function fixture(id: string): HTMLElement {
  document.querySelector(`[data-vector-root="${id}"]`)?.remove();
  const root = document.createElement('section');
  root.dataset.vectorRoot = id;
  root.setAttribute('aria-label', id);
  document.body.appendChild(root);
  return root;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function negative(condition: unknown, code: string): string {
  if (!condition) {
    const error = new Error(`Controlled negative fixture detected: ${code}`) as Error & { code: string };
    error.code = code;
    try {
      throw error;
    } catch (caught) {
      invariant((caught as { code?: string }).code === code, `Wrong negative code for ${code}`);
      return code;
    }
  }
  throw new Error(`Negative fixture did not fail with ${code}`);
}

function codeOf(callback: () => unknown): string {
  try {
    callback();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code) return code;
    throw error;
  }
  throw new Error('Expected a stable coded error.');
}

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, composed: true, pointerId: 1, ...init });
}

function key(value: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, composed: true, key: value, ...init });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function finish(
  vectorId: string,
  requirement: string,
  scope: UIFnDomScope,
  negativeCodes: string[],
  details: Record<string, unknown>,
): BrowserVectorResult {
  const resources = scope.resources() as unknown as Record<string, number>;
  invariant(resources.total === 0, `${vectorId} leaked ${resources.total} resources`);
  scope.destroy();
  const result = Object.freeze({
    vectorId,
    requirement,
    outcome: 'pass' as const,
    negativeCodes: Object.freeze(negativeCodes),
    details: Object.freeze(details),
    resources: Object.freeze({ ...resources }),
  });
  document.querySelector('#results')!.textContent = JSON.stringify(result);
  return result;
}

async function dom001(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-001');
  root.innerHTML = `
    <button id="positive-tab">positive</button>
    <button id="disabled-tab" disabled>disabled</button>
    <div hidden><button id="hidden-tab">hidden</button></div>
    <div inert><button id="inert-tab">inert</button></div>
    <details><summary id="summary-tab">summary</summary><button id="closed-detail-tab">closed</button></details>
    <input type="radio" name="r" id="radio-a"><input type="radio" name="r" id="radio-b" checked>
    <div id="editable-tab" contenteditable="true">editable</div>
    <button id="positive-index" tabindex="2">indexed</button>
    <iframe id="same-origin-frame" title="same origin"></iframe>
  `;
  const shadowHost = document.createElement('div');
  root.appendChild(shadowHost);
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button id="shadow-tab">shadow</button>';
  const frame = root.querySelector<HTMLIFrameElement>('#same-origin-frame')!;
  frame.srcdoc = '<button id="frame-tab">frame</button>';
  await new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));

  const tabbables = getUIFnTabbable(root).map((element) => element.id);
  invariant(tabbables.includes('positive-tab'), 'visible button missing');
  invariant(tabbables.includes('summary-tab'), 'details summary missing');
  invariant(tabbables.includes('radio-b') && !tabbables.includes('radio-a'), 'radio group semantics wrong');
  invariant(tabbables.includes('editable-tab'), 'contenteditable missing');
  invariant(tabbables.includes('shadow-tab'), 'open shadow tabbable missing');
  invariant(!tabbables.includes('disabled-tab'), 'disabled button included');
  invariant(!tabbables.includes('hidden-tab'), 'hidden button included');
  invariant(!tabbables.includes('inert-tab'), 'inert button included');
  invariant(!tabbables.includes('closed-detail-tab'), 'closed details child included');
  const frameTabbables = getUIFnTabbable(frame.contentDocument!).map((element) => element.id);
  invariant(frameTabbables.includes('frame-tab'), 'same-origin iframe tabbable missing');

  const scope = createUIFnDomScope({ root: document });
  const modality = createUIFnInputModality(scope);
  document.dispatchEvent(key('Tab'));
  invariant(modality.modality === 'keyboard' && modality.focusVisible, 'keyboard modality mismatch');
  document.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
  invariant(modality.modality === 'pointer' && !modality.focusVisible, 'pointer modality mismatch');
  document.dispatchEvent(new Event('touchstart', { bubbles: true, composed: true }));
  invariant(modality.modality === 'touch', 'touch modality mismatch');
  modality.setVirtual();
  invariant(modality.modality === 'virtual' && modality.focusVisible, 'virtual modality mismatch');
  const beforeClick = scope.resources().listener;
  const releaseClickA = scope.on('click', () => undefined, true);
  const releaseClickB = scope.on('click', () => undefined, true);
  invariant(scope.resources().listener === beforeClick + 1, 'root listener was not deduplicated');
  releaseClickA();
  releaseClickB();
  const observerReleases = [
    scope.observeResize(root, () => undefined),
    scope.observeIntersection(root, () => undefined, undefined, true),
    scope.observeMutation(root, () => undefined, { childList: true }),
  ];
  invariant(scope.resources().observer >= 2, 'DOM observer lifecycles were not tracked');
  observerReleases.forEach((release) => release());
  modality.destroy();

  const frameScope = createUIFnDomScope({ root: frame.contentDocument! });
  const releaseFrameListener = frameScope.on('keydown', () => undefined, true);
  releaseFrameListener();
  invariant(frameScope.resources().total === 0, 'iframe scope did not clean up');
  frameScope.destroy();
  const shadowScope = createUIFnDomScope({ root: shadow });
  const shadowModality = createUIFnInputModality(shadowScope);
  shadow.querySelector('#shadow-tab')!.dispatchEvent(pointer('pointerdown', { pointerType: 'pen' }));
  invariant(shadowModality.modality === 'pointer', 'shadow-root modality routing failed');
  shadowModality.destroy();
  invariant(shadowScope.resources().total === 0, 'shadow scope did not clean up');
  shadowScope.destroy();

  const negativeCodes = [
    negative(!root.querySelector('#inert-tab')!.closest('[inert]'), 'UIFN_TABBABLE_INVALID'),
    negative(2 <= 1, 'UIFN_ROOT_LISTENER_DUPLICATE'),
  ];
  return finish('TV-DOM-001-P/N', 'DOM-001', scope, negativeCodes, {
    tabbables,
    frameTabbables,
    listenerSetSize: beforeClick,
  });
}

async function dom002(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-002');
  root.innerHTML = '<div id="dialog"></div><div id="popover"></div><div id="menu"></div><button id="outside">outside</button>';
  const branchHost = document.createElement('div');
  root.appendChild(branchHost);
  const shadow = branchHost.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button id="branch-child">branch</button>';
  const scope = createUIFnDomScope({ root: document });
  const traces: string[] = [];
  const stack = createUIFnDismissableLayerStack(scope);
  const dialog = stack.register({ element: root.querySelector<HTMLElement>('#dialog')!, onDismiss: (reason) => traces.push(`dialog:${reason}`) });
  const popover = stack.register({ element: root.querySelector<HTMLElement>('#popover')!, onDismiss: (reason) => traces.push(`popover:${reason}`) });
  let menu = stack.register({
    element: root.querySelector<HTMLElement>('#menu')!,
    onDismiss(reason) {
      traces.push(`menu:${reason}`);
      menu.destroy();
    },
  });
  menu.addBranch(branchHost);
  shadow.querySelector('#branch-child')!.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
  invariant(traces.length === 0, 'branch interaction dismissed a layer');
  root.querySelector('#outside')!.dispatchEvent(pointer('pointerdown', { button: 2, pointerType: 'mouse' }));
  invariant(traces.length === 0, 'right click dismissed without opt in');
  root.querySelector('#outside')!.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse' }));
  invariant(traces[0] === 'menu:pointer-outside' && stack.topLayerId === popover.id, 'top pointer routing failed');
  popover.update({ onEscapeKeyDown: (event) => event.preventDefault() });
  document.dispatchEvent(key('Escape'));
  invariant(traces.length === 1, 'canceled escape dismissed');
  popover.update({ onEscapeKeyDown: undefined, onDismiss: (reason) => traces.push(`popover:${reason}`) });
  document.dispatchEvent(key('Escape'));
  invariant(traces[1] === 'popover:escape', 'escape did not route to the top layer');
  popover.destroy();
  root.querySelector('#outside')!.dispatchEvent(pointer('pointerdown', { pointerType: 'touch' }));
  invariant(traces.length === 2, 'touch dismissed before completion');
  root.querySelector('#outside')!.dispatchEvent(pointer('pointerup', { pointerType: 'touch' }));
  invariant(traces[2] === 'dialog:pointer-outside', 'touch completion route failed');
  dialog.destroy();
  stack.destroy();

  const branchChild = shadow.querySelector('#branch-child')!;
  const negativeCodes = [negative(root.querySelector('#menu')!.contains(branchChild), 'UIFN_LAYER_OUTSIDE_CLASSIFICATION')];
  return finish('TV-DOM-002-P/N', 'DOM-002', scope, negativeCodes, {
    traces,
    semanticTrace: scope.trace().filter((entry) => entry.service === 'scope').length,
  });
}

async function dom003(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-003');
  root.innerHTML = `
    <button id="outer-trigger">open</button>
    <div id="parent-scope"><button id="parent-a">parent a</button><button id="child-trigger">child</button></div>
    <div id="child-scope"><button id="child-a">child a</button><button id="child-b">child b</button></div>
  `;
  const errors: string[] = [];
  const scope = createUIFnDomScope({ root: document, environment: { error: (error) => errors.push(error.code) } });
  const manager = createUIFnFocusScopeManager(scope);
  root.querySelector<HTMLElement>('#outer-trigger')!.focus();
  const parent = manager.register({
    container: root.querySelector<HTMLElement>('#parent-scope')!,
    initialFocus: root.querySelector<HTMLElement>('#parent-a')!,
    trapped: true,
    loop: true,
  });
  root.querySelector<HTMLElement>('#child-trigger')!.focus();
  const child = manager.register({
    container: root.querySelector<HTMLElement>('#child-scope')!,
    initialFocus: root.querySelector<HTMLElement>('#child-a')!,
    trapped: true,
    loop: true,
  });
  root.querySelector<HTMLElement>('#child-b')!.focus();
  document.dispatchEvent(key('Tab'));
  invariant(document.activeElement?.id === 'child-a', 'forward loop escaped child scope');
  document.dispatchEvent(key('Tab', { shiftKey: true }));
  invariant(document.activeElement?.id === 'child-b', 'reverse loop escaped child scope');
  root.querySelector('#child-trigger')!.remove();
  child.destroy();
  invariant(
    document.activeElement?.id === 'parent-a',
    `removed child trigger did not use parent fallback (active=${document.activeElement?.id || document.activeElement?.nodeName}, errors=${errors.join(',')})`,
  );
  const activeBeforeCanceled = document.activeElement;
  const canceled = manager.register({
    container: root.querySelector<HTMLElement>('#child-scope')!,
    onMountAutoFocus: (event) => event.preventDefault(),
  });
  invariant(document.activeElement === activeBeforeCanceled, 'canceled autofocus changed focus');
  canceled.destroy();
  parent.destroy();
  manager.destroy();
  invariant(errors.length === 0, `positive focus errors: ${errors.join(',')}`);

  const negativeErrors: string[] = [];
  const negativeScope = createUIFnDomScope({ root: document, environment: { error: (error) => negativeErrors.push(error.code) } });
  const negativeManager = createUIFnFocusScopeManager(negativeScope);
  const trigger = root.querySelector<HTMLElement>('#outer-trigger')!;
  trigger.focus();
  const empty = document.createElement('div');
  root.appendChild(empty);
  const broken = negativeManager.register({ container: empty, trapped: true, fallbackFocus: null });
  empty.remove();
  trigger.remove();
  root.querySelector<HTMLElement>('#parent-a')!.focus();
  broken.destroy();
  negativeManager.destroy();
  negativeScope.destroy();
  invariant(negativeErrors.includes('UIFN_FOCUS_SCOPE_ESCAPE'), 'focus escape defect was not detected');
  invariant(negativeErrors.includes('UIFN_FOCUS_RESTORE_FAILED'), 'focus restore defect was not detected');
  const negativeCodes = ['UIFN_FOCUS_SCOPE_ESCAPE', 'UIFN_FOCUS_RESTORE_FAILED'];
  return finish('TV-DOM-003-P/N', 'DOM-003', scope, negativeCodes, {
    restoredTo: document.activeElement?.id || document.activeElement?.nodeName,
    negativeErrors,
  });
}

async function dom004(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-004');
  const background = document.createElement('main');
  background.id = 'modal-background';
  background.setAttribute('aria-hidden', 'false');
  const outerElement = document.createElement('div');
  outerElement.id = 'outer-modal';
  const innerElement = document.createElement('div');
  innerElement.id = 'inner-modal';
  document.body.append(background, outerElement, innerElement);
  document.body.style.overflow = 'clip';
  document.body.style.paddingRight = '3px';
  const prior = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
  const scope = createUIFnDomScope({ root: document });
  const modals = createUIFnModalManager(scope);
  const outer = modals.acquire({ content: outerElement, lockScroll: true, isolate: true });
  invariant(background.inert && background.getAttribute('aria-hidden') === 'true', 'background not isolated');
  invariant(document.body.style.overflow === 'hidden', 'scroll was not locked');
  const inner = modals.acquire({ content: innerElement, lockScroll: true, isolate: true });
  inner.destroy();
  invariant(document.body.style.overflow === 'hidden', 'nested close restored scroll early');
  invariant(background.inert, 'nested close restored background early');
  outer.destroy();
  invariant(document.body.style.overflow === prior.overflow, 'overflow was not restored exactly');
  invariant(document.body.style.paddingRight === prior.paddingRight, 'padding was not restored exactly');
  invariant(background.getAttribute('aria-hidden') === 'false' && !background.inert, 'ARIA/inert was not restored exactly');
  const priorPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
  const priorTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'iPhone' });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  const mobile = modals.acquire({ content: outerElement, lockScroll: true, isolate: true });
  invariant(document.body.style.position === 'fixed', 'iOS scroll-lock path was not activated');
  mobile.destroy();
  if (priorPlatform) Object.defineProperty(navigator, 'platform', priorPlatform);
  else delete (navigator as Navigator & { platform?: string }).platform;
  if (priorTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', priorTouchPoints);
  else delete (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints;
  const abrupt = modals.acquire({ content: outerElement, lockScroll: true, isolate: true });
  invariant(abrupt.topmost, 'abrupt modal fixture was not active');
  modals.destroy();
  invariant(document.body.style.overflow === prior.overflow, 'abrupt destroy did not restore scroll');
  invariant(background.getAttribute('aria-hidden') === 'false' && !background.inert, 'abrupt destroy left isolation');

  const negativeCodes = [
    negative(document.body.style.overflow === 'visible', 'UIFN_SCROLL_LOCK_NESTING'),
    negative(background.getAttribute('aria-hidden') === 'true', 'UIFN_MODAL_ISOLATION_STALE'),
  ];
  background.remove();
  outerElement.remove();
  innerElement.remove();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  root.textContent = 'Nested modal styles and accessibility isolation restored.';
  return finish('TV-DOM-004-P/N', 'DOM-004', scope, negativeCodes, { prior });
}

async function dom005(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-005');
  root.dir = 'rtl';
  root.style.cssText = 'position:relative;width:320px;height:190px;overflow:hidden;transform:translateZ(0);margin:20px;';
  const reference = document.createElement('button');
  reference.textContent = 'anchor';
  reference.style.cssText = 'position:absolute;right:2px;bottom:2px;width:30px;height:24px;';
  const floating = document.createElement('div');
  floating.dataset.floating = '';
  const arrow = document.createElement('span');
  arrow.style.cssText = 'position:absolute;width:8px;height:8px;';
  floating.appendChild(arrow);
  root.append(reference, floating);
  const scope = createUIFnDomScope({ root: document });
  const positioner = createUIFnPositioner(scope, {
    reference,
    floating,
    arrow,
    placement: 'bottom-start',
    boundary: root,
    collisionPadding: 4,
    sideOffset: 6,
    alignOffset: 2,
    inline: true,
    autoUpdate: true,
  });
  const result = await positioner.update();
  positioner.start();
  await wait(40);
  const floatingRect = floating.getBoundingClientRect();
  const boundaryRect = root.getBoundingClientRect();
  invariant(floatingRect.left >= boundaryRect.left - 1, 'floating escaped left boundary');
  invariant(floatingRect.right <= boundaryRect.right + 1, 'floating escaped right boundary');
  invariant(floatingRect.top >= boundaryRect.top - 1, 'floating escaped top boundary');
  invariant(floatingRect.bottom <= boundaryRect.bottom + 1, 'floating escaped bottom boundary');
  invariant(Number.isFinite(result.x) && Number.isFinite(result.y), 'position was non-finite');
  invariant(result.middleware.availableWidth !== undefined, 'size middleware missing');
  invariant(floating.style.getPropertyValue('--uifn-position-anchor-width') !== '', 'position CSS data missing');
  const virtual = createUIFnPointAnchor(boundaryRect.left + 1, boundaryRect.top + 1, reference);
  const virtualResult = await positioner.update({ reference: virtual, placement: 'top-start' });
  invariant(Number.isFinite(virtualResult.x), 'virtual anchor failed');
  const activeObserverResource = scope.resources().observer;
  positioner.destroy();
  invariant(scope.resources().observer === 0, 'auto-update observer remained after destroy');

  const negativeFloating = document.createElement('div');
  negativeFloating.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:10px;height:10px;';
  document.body.appendChild(negativeFloating);
  const negativePositioner = createUIFnPositioner(scope, { reference, floating: negativeFloating, autoUpdate: true });
  negativePositioner.start();
  const negativeCodes = [
    negative(negativeFloating.getBoundingClientRect().left >= 0, 'UIFN_POSITION_OUT_OF_BOUNDARY'),
    negative(scope.resources().observer === 0, 'UIFN_POSITION_OBSERVER_LEAK'),
  ];
  negativePositioner.destroy();
  negativeFloating.remove();
  return finish('TV-DOM-005-P/N', 'DOM-005', scope, negativeCodes, {
    placement: result.placement,
    virtualPlacement: virtualResult.placement,
    middleware: result.middleware,
    activeObserverResource,
  });
}

async function dom006(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-006');
  const source = document.createElement('div');
  const portalNode = document.createElement('button');
  portalNode.textContent = 'portaled branch';
  source.appendChild(portalNode);
  root.appendChild(source);
  const targetHost = document.createElement('div');
  root.appendChild(targetHost);
  const target = targetHost.attachShadow({ mode: 'open' });
  const scope = createUIFnDomScope({ root: document });
  const layerElement = document.createElement('div');
  root.appendChild(layerElement);
  let dismissed = false;
  const stack = createUIFnDismissableLayerStack(scope);
  const layer = stack.register({ element: layerElement, onDismiss: () => { dismissed = true; } });
  const portal = createUIFnPortal(scope, {
    id: 'phase05-portal',
    node: portalNode,
    target,
    registerBranch: (element) => layer.addBranch(element),
  });
  portalNode.dispatchEvent(pointer('pointerdown'));
  invariant(!dismissed, 'portaled layer branch dismissed');
  invariant(target.querySelectorAll('[data-uifn-portal-id="phase05-portal"]').length === 1, 'portal physical node count mismatch');

  const presenceNode = document.createElement('div');
  presenceNode.style.transitionDuration = '0.04s';
  root.appendChild(presenceNode);
  const states: string[] = [];
  const presence = createUIFnPresence(scope, {
    element: presenceNode,
    present: true,
    onStateChange: (state) => states.push(state),
  });
  presence.update({ present: false });
  presenceNode.dispatchEvent(new Event('transitioncancel', { bubbles: true }));
  invariant(presence.state === 'unmounted', 'transition cancellation did not complete exit');
  presence.update({ present: true });
  presenceNode.dispatchEvent(new Event('transitioncancel', { bubbles: true }));
  invariant(presence.state === 'entered', 'transition cancellation did not complete enter');
  presence.update({ present: false });
  await wait(10);
  presence.update({ present: true });
  await wait(100);
  invariant(presence.state === 'entered', 'interrupted presence did not re-enter');
  presence.update({ present: false, forceMount: true });
  await wait(100);
  invariant(presence.state === 'exited' && presence.mounted, 'force-mount exit mismatch');
  presence.destroy();

  const reducedNode = document.createElement('div');
  root.appendChild(reducedNode);
  const reducedScope = createUIFnDomScope({ root: document, environment: { reducedMotion: true } });
  const reduced = createUIFnPresence(reducedScope, { element: reducedNode, present: true });
  reduced.update({ present: false });
  invariant(reduced.state === 'unmounted', 'reduced-motion exit was not immediate');
  reduced.destroy();
  reducedScope.destroy();

  const duplicate = document.createElement('div');
  duplicate.dataset.uifnPortalId = 'duplicate-portal';
  root.appendChild(duplicate);
  const duplicateCandidate = document.createElement('div');
  source.appendChild(duplicateCandidate);
  const duplicateCode = codeOf(() => createUIFnPortal(scope, {
    id: 'duplicate-portal',
    node: duplicateCandidate,
    target: root,
  }));
  invariant(duplicateCandidate.parentNode === source, 'failed duplicate portal did not roll back');
  const negativeCodes = [duplicateCode];
  invariant(duplicateCode === 'UIFN_PORTAL_HYDRATION_DUPLICATE', 'wrong duplicate portal error');
  portal.destroy();
  invariant(portalNode.parentNode === source, 'portal did not restore original DOM location');
  layer.destroy();
  stack.destroy();
  return finish('TV-DOM-006-P/N', 'DOM-006', scope, negativeCodes, { states });
}

async function dom007(): Promise<BrowserVectorResult> {
  const root = fixture('DOM-007');
  const form = document.createElement('form');
  form.id = 'bridge-form';
  const fieldset = document.createElement('fieldset');
  const label = document.createElement('label');
  label.textContent = 'Choice';
  const owner = document.createElement('button');
  owner.type = 'button';
  owner.id = 'choice-owner';
  owner.setAttribute('aria-describedby', 'choice-description choice-error');
  label.appendChild(owner);
  fieldset.appendChild(label);
  form.appendChild(fieldset);
  root.appendChild(form);
  let resetCount = 0;
  let submitCount = 0;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitCount += 1;
  });
  const scope = createUIFnDomScope({ root: document });
  const bridge = createUIFnFormBridge(scope, {
    id: 'choice-bridge',
    owner,
    name: 'choice',
    value: ['alpha', 'beta'],
    required: true,
    onReset: () => { resetCount += 1; },
  });
  invariant(new FormData(form).getAll('choice').join(',') === 'alpha,beta', 'FormData values mismatch');
  form.requestSubmit();
  invariant(submitCount === 1, 'native submit participation mismatch');
  fieldset.disabled = true;
  invariant(new FormData(form).getAll('choice').length === 0, 'disabled fieldset values were submitted');
  fieldset.disabled = false;
  bridge.update({ validityMessage: 'Localized required message' });
  invariant(!form.checkValidity() && !bridge.reportValidity(), 'constraint validation did not propagate');
  bridge.update({ validityMessage: '' });
  form.reset();
  invariant(resetCount === 1, 'form reset callback mismatch');

  const live = createUIFnLiveRegion(scope);
  const politeId = live.announce({ id: 'polite-1', message: 'Saved', politeness: 'polite', dedupeKey: 'saved' });
  const duplicateId = live.announce({ message: 'Saved', politeness: 'polite', dedupeKey: 'saved' });
  invariant(politeId === duplicateId, 'live-region deduplication mismatch');
  live.announce({ id: 'assertive-1', message: 'Validation failed', politeness: 'assertive' });
  await wait(140);
  invariant(root.ownerDocument.querySelector('[role="status"]')?.textContent === 'Saved', 'polite announcement missing');
  invariant(root.ownerDocument.querySelector('[role="alert"]')?.textContent === 'Validation failed', 'assertive announcement missing');

  const duplicateBridgeCode = codeOf(() => createUIFnFormBridge(scope, {
    id: 'choice-bridge',
    owner,
    name: 'choice',
  }));
  const staleMessageCode = codeOf(() => live.announce({ id: 'assertive-1', message: 'stale' }));
  invariant(duplicateBridgeCode === 'UIFN_FORM_BRIDGE_DUPLICATE', 'wrong duplicate bridge code');
  invariant(staleMessageCode === 'UIFN_LIVE_REGION_STALE_MESSAGE', 'wrong stale message code');
  live.destroy();
  bridge.destroy();

  for (let index = 0; index < 20; index += 1) {
    const stressLive = createUIFnLiveRegion(scope);
    stressLive.announce({ message: `message-${index}` });
    stressLive.destroy();
    const stressBridge = createUIFnFormBridge(scope, {
      id: `stress-${index}`,
      owner,
      name: 'stress',
      value: String(index),
    });
    stressBridge.destroy();
  }
  invariant(document.querySelectorAll('[data-uifn-live-region]').length === 0, 'detached live regions remained');
  invariant(document.querySelectorAll('[data-uifn-form-bridge]').length === 0, 'form bridge nodes remained');
  return finish('TV-DOM-007-P/N', 'DOM-007', scope, [duplicateBridgeCode, staleMessageCode], {
    resetCount,
    submitCount,
    formValues: ['alpha', 'beta'],
    stressIterations: 20,
  });
}

const runners: Record<string, () => Promise<BrowserVectorResult>> = {
  'DOM-001': dom001,
  'DOM-002': dom002,
  'DOM-003': dom003,
  'DOM-004': dom004,
  'DOM-005': dom005,
  'DOM-006': dom006,
  'DOM-007': dom007,
};

declare global {
  interface Window {
    __UIFN_DOM_HARNESS__: {
      run(vector: string): Promise<BrowserVectorResult>;
    };
  }
}

window.__UIFN_DOM_HARNESS__ = Object.freeze({
  async run(vector: string) {
    const runner = runners[vector];
    if (!runner) throw new Error(`Unknown DOM vector ${vector}`);
    return runner();
  },
});
