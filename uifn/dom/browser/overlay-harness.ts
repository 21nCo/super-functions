import {
  createAlertDialogController,
  createDialogController,
  createDrawerController,
  createFloatingPanelController,
  createHoverCardController,
  createPopoverController,
  createTooltipController,
  createTourController,
  type UIFnOverlayBaseState,
} from '@uifn/core';
import {
  applyUIFnPartProps,
  createUIFnDomPlatform,
  createUIFnOverlayDomBinding,
  type UIFnDomPlatform,
  type UIFnOverlayDomBinding,
} from '@uifn/dom';

interface OverlayBrowserResult {
  readonly vectorId: 'TV-PRIM-002-P/N';
  readonly outcome: 'pass';
  readonly primitives: readonly string[];
  readonly focus: Readonly<Record<string, string>>;
  readonly geometry: Readonly<Record<string, string>>;
  readonly nestedDismissal: readonly string[];
  readonly negativeCodes: readonly string[];
  readonly traceKinds: readonly string[];
  readonly resourceTotals: readonly number[];
}

interface AnyOverlayController {
  readonly state: UIFnOverlayBaseState;
  readonly actions: Record<string, (...args: any[]) => any>;
  readonly parts: Record<string, { getProps(): any }>;
  getState(): UIFnOverlayBaseState;
  update(inputs: Record<string, unknown>): void;
  subscribe(callback: () => void, options?: { emitInitial?: boolean }): () => void;
  destroy(): void;
}

interface OverlayFixture {
  readonly host: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly source: HTMLElement;
  readonly positioner: HTMLElement;
  readonly content: HTMLElement;
  readonly arrow: HTMLElement;
  readonly parts: Readonly<Record<string, HTMLElement>>;
  destroy(): void;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pointer(type: string, pointerType = 'mouse'): PointerEvent {
  return new PointerEvent(type, { bubbles: true, composed: true, pointerId: 7, pointerType });
}

function key(value: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, composed: true, key: value });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function codeOf(callback: () => unknown): string {
  try { callback(); } catch (error) {
    const code = (error as { code?: string }).code;
    if (code) return code;
    throw error;
  }
  throw new Error('Expected a coded error.');
}

function createFixture(
  name: string,
  controller: AnyOverlayController,
  parent: HTMLElement = document.body,
  withTitle = true,
): OverlayFixture {
  const host = document.createElement('section');
  host.dataset.overlayFixture = name;
  const trigger = document.createElement('button');
  trigger.textContent = `Open ${name}`;
  const source = document.createElement('div');
  const backdrop = document.createElement('div');
  const positioner = document.createElement('div');
  positioner.style.cssText = 'width:180px;min-height:80px;background:white;border:1px solid #334155;padding:8px;';
  const content = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = withTitle ? `${name} title` : '';
  const description = document.createElement('p');
  description.textContent = name === 'Tooltip' ? 'Tooltip description' : `${name} description`;
  const arrow = document.createElement('span');
  const partElements: Record<string, HTMLElement> = {
    root: host, trigger, portal: source, backdrop, positioner, content,
    title, description, arrow,
  };
  const buttonParts = ['cancel', 'action', 'close', 'handle', 'previous', 'next', 'skip', 'dragHandle', 'resizeHandle'];
  for (const part of buttonParts) {
    const button = document.createElement('button');
    button.textContent = part;
    button.dataset.uifnPart = part;
    partElements[part] = button;
  }
  const structuralParts = ['header', 'spotlight', 'progress', 'anchor'];
  for (const part of structuralParts) {
    const element = document.createElement('div');
    element.dataset.uifnPart = part;
    partElements[part] = element;
  }
  host.append(trigger, source);
  source.append(backdrop, positioner);
  positioner.append(content, arrow);
  content.append(
    title,
    description,
    ...buttonParts.map((part) => partElements[part]),
    ...structuralParts.filter((part) => part !== 'anchor').map((part) => partElements[part]),
  );
  host.append(partElements.anchor);
  parent.appendChild(host);
  const releases: Array<() => void> = [];
  for (const [part, api] of Object.entries(controller.parts)) {
    const element = partElements[part];
    if (!element || !api?.getProps) continue;
    element.dataset.uifnPart = part;
    releases.push(applyUIFnPartProps(
      element,
      part === 'resizeHandle' ? api.getProps('south-east') : api.getProps(),
    ));
  }
  if (name === 'Tooltip') content.textContent = 'Tooltip description';
  return {
    host, trigger, source, positioner, content, arrow, parts: Object.freeze(partElements),
    destroy() { releases.forEach((release) => release()); host.remove(); },
  };
}

function bind(
  platform: UIFnDomPlatform,
  controller: AnyOverlayController,
  fixture: OverlayFixture,
  options: { parent?: UIFnOverlayDomBinding; portalTarget?: Element | ShadowRoot; validate?: boolean } = {},
): UIFnOverlayDomBinding {
  return createUIFnOverlayDomBinding({
    platform,
    controller: controller as any,
    content: fixture.content,
    trigger: fixture.trigger,
    positioner: fixture.positioner,
    reference: fixture.trigger,
    arrow: fixture.arrow,
    portalNode: fixture.positioner,
    portalTarget: options.portalTarget,
    parent: options.parent,
    initialFocus: controller.state.policy.initialFocus === 'cancel'
      ? fixture.parts.cancel
      : controller.state.policy.initialFocus === 'next'
        ? fixture.parts.next
        : undefined,
    fallbackFocus: fixture.trigger,
    validateAccessibleName: options.validate ?? true,
    sideOffset: 6,
    collisionPadding: 4,
  });
}

async function exerciseOpenPrimitive(
  name: string,
  controller: AnyOverlayController,
  focus: Record<string, string>,
  geometry: Record<string, string>,
  traceKinds: Set<string>,
  resourceTotals: number[],
): Promise<void> {
  const traces: string[] = [];
  const platform = createUIFnDomPlatform({
    root: document,
    environment: { trace: (entry) => traces.push(entry.kind) },
  });
  const fixture = createFixture(name, controller);
  fixture.trigger.focus();
  const binding = bind(platform, controller, fixture);
  await wait(30);
  invariant(binding.open, `${name} did not bind open state`);
  invariant(fixture.content.getAttribute('role') === controller.state.policy.role || controller.state.policy.role === 'presentation', `${name} role mismatch`);
  if (controller.state.policy.initialFocus !== 'none') {
    invariant(fixture.content.contains(document.activeElement), `${name} autofocus escaped content`);
  }
  focus[name] = (document.activeElement as HTMLElement | null)?.id || (document.activeElement as HTMLElement | null)?.dataset.uifnPart || 'none';
  if (controller.state.policy.position !== 'none') {
    const left = fixture.positioner.style.left;
    const top = fixture.positioner.style.top;
    invariant(left.endsWith('px') && top.endsWith('px'), `${name} shared positioner did not apply geometry`);
    geometry[name] = `${left},${top},${fixture.positioner.dataset.side}`;
  }

  if (name === 'Dialog') {
    controller.update({ modal: false, trapFocus: false, scrollLock: false });
    await wait(20);
    invariant(platform.modals.size === 0, 'Dialog retained modal resources after an open update');
    controller.update({ modal: true, trapFocus: true, scrollLock: true });
    await wait(20);
    invariant(platform.modals.size === 1, 'Dialog did not reacquire modal resources after an open update');
  }
  if (name === 'Popover') {
    controller.update({ placement: 'top-start' });
    await wait(20);
    invariant(fixture.positioner.dataset.side === 'top', 'Popover did not apply an open placement update');
  }

  if (name === 'AlertDialog') {
    invariant(document.activeElement === fixture.parts.cancel, 'AlertDialog did not focus least-destructive action');
    document.body.dispatchEvent(pointer('pointerdown'));
    invariant(controller.state.open, 'AlertDialog dismissed outside');
  } else if (name === 'Drawer') {
    document.body.dispatchEvent(pointer('pointerdown', 'touch'));
    invariant(controller.state.open, 'Drawer touch dismissed before completion');
    document.body.dispatchEvent(pointer('pointerup', 'touch'));
    invariant(!controller.state.open, 'Drawer touch completion did not dismiss');
  }
  if (controller.state.open) document.dispatchEvent(key('Escape'));
  invariant(!controller.state.open, `${name} Escape did not close`);
  invariant(document.activeElement === fixture.trigger || document.activeElement === document.body, `${name} focus did not restore or fall back`);
  binding.destroy();
  controller.destroy();
  fixture.destroy();
  platform.destroy();
  const resources = platform.scope.resources();
  resourceTotals.push(resources.total);
  invariant(resources.total === 0, `${name} leaked ${resources.total} DOM resources`);
  traces.forEach((kind) => traceKinds.add(kind));
}

async function exerciseHoverAndTooltip(
  focus: Record<string, string>,
  geometry: Record<string, string>,
  traceKinds: Set<string>,
  resourceTotals: number[],
): Promise<void> {
  for (const name of ['HoverCard', 'Tooltip'] as const) {
    const traces: string[] = [];
    const platform = createUIFnDomPlatform({ root: document, environment: { trace: (entry) => traces.push(entry.kind) } });
    const controller = (name === 'HoverCard'
      ? createHoverCardController({ openDelay: 12, closeDelay: 12 })
      : createTooltipController({ openDelay: 12, closeDelay: 0 })) as unknown as AnyOverlayController;
    const fixture = createFixture(name, controller);
    const binding = bind(platform, controller, fixture);
    fixture.trigger.dispatchEvent(pointer('pointerenter', 'touch'));
    await wait(18);
    invariant(!controller.state.open, `${name} opened from touch hover`);
    fixture.trigger.dispatchEvent(pointer('pointerenter', 'mouse'));
    await wait(22);
    invariant(controller.state.open, `${name} hover delay did not open`);
    await wait(20);
    invariant(fixture.positioner.style.left.endsWith('px'), `${name} geometry missing`);
    geometry[name] = `${fixture.positioner.style.left},${fixture.positioner.style.top},${fixture.positioner.dataset.side}`;
    if (name === 'HoverCard') {
      fixture.trigger.dispatchEvent(pointer('pointerleave', 'mouse'));
      fixture.content.dispatchEvent(pointer('pointerenter', 'mouse'));
      await wait(18);
      invariant(controller.state.open, 'HoverCard closed while pointer entered content');
      fixture.content.dispatchEvent(pointer('pointerleave', 'mouse'));
      await wait(18);
      invariant(!controller.state.open, 'HoverCard content leave did not close');
    } else {
      document.dispatchEvent(key('Escape'));
      invariant(!controller.state.open, 'Tooltip Escape did not close');
      fixture.trigger.focus();
      invariant(controller.state.open, 'Tooltip focus did not open immediately');
      invariant(controller.parts.trigger.getProps().aria.describedby === controller.state.ids.contentId, 'Tooltip did not describe trigger');
      invariant(!('label' in controller.parts.trigger.getProps().aria), 'Tooltip replaced trigger accessible name');
      fixture.trigger.blur();
      invariant(!controller.state.open, 'Tooltip blur did not close');
    }
    focus[name] = (document.activeElement as HTMLElement | null)?.id || 'none';
    binding.destroy(); controller.destroy(); fixture.destroy(); platform.destroy();
    const resources = platform.scope.resources();
    resourceTotals.push(resources.total);
    invariant(resources.total === 0, `${name} leaked resources`);
    traces.forEach((kind) => traceKinds.add(kind));
  }
}

async function exerciseNestedStack(traceKinds: Set<string>, resourceTotals: number[]): Promise<string[]> {
  const traces: string[] = [];
  const platform = createUIFnDomPlatform({ root: document, environment: { trace: (entry) => traces.push(entry.kind) } });
  const fallback = document.createElement('button');
  fallback.textContent = 'fallback';
  document.body.appendChild(fallback);
  const dialog = createDialogController({ defaultOpen: true }) as unknown as AnyOverlayController;
  const dialogFixture = createFixture('NestedDialog', dialog);
  dialogFixture.trigger.focus();
  const dialogBinding = bind(platform, dialog, dialogFixture);
  const shadowHost = document.createElement('div');
  document.body.appendChild(shadowHost);
  const shadow = shadowHost.attachShadow({ mode: 'open' });
  const popover = createPopoverController({ defaultOpen: true }) as unknown as AnyOverlayController;
  const popoverFixture = createFixture('NestedPopover', popover, dialogFixture.content);
  popoverFixture.trigger.focus();
  const popoverBinding = bind(platform, popover, popoverFixture, { parent: dialogBinding, portalTarget: shadow });
  await wait(20);
  invariant(
    popoverFixture.content.contains(shadow.activeElement),
    `portaled shadow popover lost focus containment (document=${(document.activeElement as HTMLElement | null)?.id || document.activeElement?.nodeName}, shadow=${(shadow.activeElement as HTMLElement | null)?.id || shadow.activeElement?.nodeName}, content=${popoverFixture.content.id}, connected=${popoverFixture.content.isConnected}, tabindex=${popoverFixture.content.tabIndex}, hidden=${popoverFixture.content.hidden}, hostInert=${shadowHost.inert})`,
  );
  const menu = document.createElement('div');
  menu.tabIndex = -1;
  menu.textContent = 'menu';
  popoverFixture.content.appendChild(menu);
  const releaseMenuBranch = popoverBinding.addBranch(menu);
  const order: string[] = [];
  let menuLayer = platform.layers.register({
    id: 'phase-07-menu-layer',
    element: menu,
    onDismiss(reason) { order.push(`menu:${reason}`); menuLayer.destroy(); },
  });
  const outside = document.createElement('button');
  outside.textContent = 'outside';
  document.body.appendChild(outside);
  outside.dispatchEvent(pointer('pointerdown'));
  invariant(order[0] === 'menu:pointer-outside' && popover.state.open && dialog.state.open, 'menu was not top layer');
  outside.dispatchEvent(pointer('pointerdown'));
  invariant(!popover.state.open && dialog.state.open, 'popover was not second layer');
  order.push('popover:pointer-outside');
  outside.dispatchEvent(pointer('pointerdown'));
  invariant(!dialog.state.open, 'dialog was not final layer');
  order.push('dialog:pointer-outside');

  popover.actions.syncOpen(true);
  popover.actions.syncOpen(false);
  popover.actions.syncOpen(true);
  await wait(20);
  invariant(shadow.querySelectorAll(`[data-uifn-portal-id="${popover.state.ids.portalId}"]`).length === 1, 'close/reopen duplicated portal node');
  popoverFixture.trigger.remove();
  popover.actions.syncOpen(false);
  popoverBinding.destroy();
  dialogBinding.destroy();
  releaseMenuBranch();
  popover.destroy(); dialog.destroy();
  popoverFixture.destroy(); dialogFixture.destroy();
  outside.remove(); shadowHost.remove(); fallback.remove();
  platform.destroy();
  const resources = platform.scope.resources();
  resourceTotals.push(resources.total);
  invariant(resources.total === 0, `nested stack leaked ${resources.total} resources`);
  traces.forEach((kind) => traceKinds.add(kind));
  return order;
}

async function negativeVectors(resourceTotals: number[]): Promise<string[]> {
  const alertCode = codeOf(() => createAlertDialogController({ closeOnInteractOutside: true } as never));
  const platform = createUIFnDomPlatform({ root: document });
  const controller = createAlertDialogController({ defaultOpen: true }) as unknown as AnyOverlayController;
  const fixture = createFixture('MissingTitleAlertDialog', controller, document.body, false);
  fixture.parts.title.remove();
  const nameCode = codeOf(() => bind(platform, controller, fixture));
  controller.destroy(); fixture.destroy(); platform.destroy();
  resourceTotals.push(platform.scope.resources().total);
  invariant(alertCode === 'UIFN_ALERT_DIALOG_DISMISSAL', 'wrong AlertDialog dismissal code');
  invariant(nameCode === 'UIFN_ACCESSIBLE_NAME_MISSING', 'wrong accessible-name code');
  invariant(platform.scope.resources().total === 0, 'negative binding leaked resources');
  return [alertCode, nameCode];
}

export async function runOverlayVectors(): Promise<OverlayBrowserResult> {
  document.querySelectorAll('[data-overlay-fixture]').forEach((node) => node.remove());
  const focus: Record<string, string> = {};
  const geometry: Record<string, string> = {};
  const traceKinds = new Set<string>();
  const resourceTotals: number[] = [];
  const openControllers: Array<[string, AnyOverlayController]> = [
    ['AlertDialog', createAlertDialogController({ defaultOpen: true }) as unknown as AnyOverlayController],
    ['Dialog', createDialogController({ defaultOpen: true }) as unknown as AnyOverlayController],
    ['Drawer', createDrawerController({ defaultOpen: true }) as unknown as AnyOverlayController],
    ['FloatingPanel', createFloatingPanelController({ defaultOpen: true }) as unknown as AnyOverlayController],
    ['Popover', createPopoverController({ defaultOpen: true }) as unknown as AnyOverlayController],
    ['Tour', createTourController({ defaultOpen: true, steps: [{ id: 'one', title: 'One', target: '#target' }] }) as unknown as AnyOverlayController],
  ];
  for (const [name, controller] of openControllers) {
    await exerciseOpenPrimitive(name, controller, focus, geometry, traceKinds, resourceTotals);
  }
  await exerciseHoverAndTooltip(focus, geometry, traceKinds, resourceTotals);
  const nestedDismissal = await exerciseNestedStack(traceKinds, resourceTotals);
  const negativeCodes = await negativeVectors(resourceTotals);
  invariant(resourceTotals.every((total) => total === 0), 'not all resource totals were zero');
  const result: OverlayBrowserResult = Object.freeze({
    vectorId: 'TV-PRIM-002-P/N', outcome: 'pass',
    primitives: Object.freeze(['AlertDialog', 'Dialog', 'Drawer', 'FloatingPanel', 'HoverCard', 'Popover', 'Tooltip', 'Tour']),
    focus: Object.freeze(focus), geometry: Object.freeze(geometry),
    nestedDismissal: Object.freeze(nestedDismissal),
    negativeCodes: Object.freeze(negativeCodes),
    traceKinds: Object.freeze([...traceKinds].sort()),
    resourceTotals: Object.freeze(resourceTotals),
  });
  document.querySelector('#results')!.textContent = JSON.stringify(result);
  return result;
}

declare global {
  interface Window {
    __UIFN_OVERLAY_HARNESS__: { run(): Promise<OverlayBrowserResult> };
  }
}

window.__UIFN_OVERLAY_HARNESS__ = Object.freeze({ run: runOverlayVectors });
