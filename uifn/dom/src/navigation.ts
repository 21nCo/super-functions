import type {
  MenuController,
  MenuState,
  NavigationMenuController,
  UIFnChangeMeta,
} from '@uifn/core';
import type { UIFnDomPlatform } from './platform';
import type { UIFnDismissableLayerHandle } from './layers';
import type { UIFnFocusScopeHandle } from './focus-scope';
import { createUIFnPortal, type UIFnPortalHandle, type UIFnPortalTarget } from './portal';
import { createUIFnPositioner, type UIFnPositioner, type UIFnVirtualAnchor } from './positioning';
import { createUIFnPresence, type UIFnPresence } from './presence';

type ResolveElement = HTMLElement | (() => HTMLElement | null);

export interface UIFnSubmenuDomElements {
  readonly id: string;
  readonly trigger: ResolveElement;
  readonly content: ResolveElement;
  readonly positioner?: ResolveElement;
}

export interface UIFnMenuDomBindingOptions {
  readonly platform: UIFnDomPlatform;
  readonly controller: Pick<MenuController, 'state' | 'actions' | 'getState' | 'subscribe'>;
  /** Stable per-instance prefix used by DOM-owned layers and portals. */
  readonly id?: string;
  readonly trigger: ResolveElement;
  readonly content: ResolveElement;
  readonly positioner?: ResolveElement;
  readonly portalNode?: Node | null;
  readonly portalTarget?: UIFnPortalTarget;
  readonly portalDisabled?: boolean;
  readonly portalManagedExternally?: boolean;
  readonly submenus?: readonly UIFnSubmenuDomElements[];
  readonly getItemElement?: (id: string) => HTMLElement | null;
  readonly longPressDelay?: number;
  readonly pointerGraceDelay?: number;
}

export interface UIFnMenuDomBinding {
  readonly open: boolean;
  readonly destroyed: boolean;
  readonly layerIds: readonly string[];
  update(): void;
  destroy(): void;
}

export interface UIFnNavigationMenuDomBindingOptions {
  readonly platform: UIFnDomPlatform;
  readonly controller: Pick<NavigationMenuController, 'state' | 'actions' | 'getState' | 'subscribe'>;
  readonly getTriggerElement?: (id: string) => HTMLElement | null;
}

export interface UIFnNavigationMenuDomBinding {
  readonly destroyed: boolean;
  update(): void;
  destroy(): void;
}

export interface UIFnRovingFocusDomBindingOptions<TState> {
  readonly platform: UIFnDomPlatform;
  readonly controller: {
    getState(): TState;
    subscribe(
      callback: (state: Readonly<TState>, meta?: Readonly<UIFnChangeMeta<any, TState>>) => void,
      options?: { emitInitial?: boolean },
    ): () => void;
  };
  readonly getActiveKey: (state: Readonly<TState>) => string | null;
  readonly getElement: (key: string) => HTMLElement | null;
  readonly focusInitial?: boolean;
}

export interface UIFnRovingFocusDomBinding {
  readonly destroyed: boolean;
  update(): void;
  destroy(): void;
}

interface Point { readonly x: number; readonly y: number }
interface Triangle { readonly a: Point; readonly b: Point; readonly c: Point }

function resolve(value: ResolveElement | undefined): HTMLElement | null {
  return typeof value === 'function' ? value() : value ?? null;
}

function sign(point: Point, first: Point, second: Point): number {
  return (point.x - second.x) * (first.y - second.y)
    - (first.x - second.x) * (point.y - second.y);
}

/** Inclusive triangle test used by every nested menu adapter. */
export function isUIFnPointInPointerGraceTriangle(point: Point, triangle: Triangle): boolean {
  const first = sign(point, triangle.a, triangle.b);
  const second = sign(point, triangle.b, triangle.c);
  const third = sign(point, triangle.c, triangle.a);
  const negative = first < 0 || second < 0 || third < 0;
  const positive = first > 0 || second > 0 || third > 0;
  return !(negative && positive);
}

function graceTriangle(origin: Point, content: DOMRect): Triangle {
  const opensRight = content.left >= origin.x;
  const edge = opensRight ? content.left : content.right;
  return {
    a: origin,
    b: { x: edge, y: content.top - 8 },
    c: { x: edge, y: content.bottom + 8 },
  };
}

function virtualAnchor(state: MenuState): UIFnVirtualAnchor | null {
  if (!state.contextPoint) return null;
  const { x, y } = state.contextPoint;
  return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
}

function escaped(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

/**
 * Owns all browser behavior for Menu and ContextMenu. Core remains DOM-free;
 * framework adapters only render controller parts and pass their elements here.
 */
export function createUIFnMenuDomBinding(options: UIFnMenuDomBindingOptions): UIFnMenuDomBinding {
  const { platform, controller } = options;
  const { scope } = platform;
  scope.assertAlive('create menu DOM binding');
  const submenus = [...(options.submenus ?? [])];
  let destroyed = false;
  let open = false;
  let rootFocus: UIFnFocusScopeHandle | null = null;
  let rootPositioner: UIFnPositioner | null = null;
  let rootPresence: UIFnPresence | null = null;
  let portal: UIFnPortalHandle | null = null;
  let cancelLongPress: () => void = () => undefined;
  let cancelGrace: () => void = () => undefined;
  let grace: { id: string; triangle: Triangle } | null = null;
  let touchOrigin: Point | null = null;
  const submenuFocus = new Map<string, UIFnFocusScopeHandle>();
  const submenuPositioners = new Map<string, UIFnPositioner>();

  const trigger = () => resolve(options.trigger);
  const content = () => resolve(options.content);
  const positioner = () => resolve(options.positioner) ?? content();
  const bindingId = options.id?.trim() || controller.getState().primitive.toLowerCase();
  const itemElement = (id: string) => options.getItemElement?.(id)
    ?? content()?.querySelector<HTMLElement>(`[data-value="${escaped(id)}"]`)
    ?? scope.document.getElementById(id);
  const submenuFor = (id: string) => submenus.find((submenu) => submenu.id === id);

  const layer: UIFnDismissableLayerHandle = platform.layers.register({
    id: `${bindingId}-root-layer`,
    element: content,
    enabled: false,
    dismissOnPointerOutside: true,
    dismissOnFocusOutside: true,
    dismissOnEscape: true,
    onDismiss: () => controller.actions.close(),
  });
  const releaseTriggerBranch = trigger() ? layer.addBranch(trigger() as HTMLElement) : () => undefined;

  const submenuLayers = new Map<string, UIFnDismissableLayerHandle>();
  const submenuBranchReleases: Array<() => void> = [];
  for (const submenu of submenus) {
    const submenuLayer = platform.layers.register({
      id: `${bindingId}-${submenu.id}-layer`,
      element: () => resolve(submenu.content),
      enabled: false,
      dismissOnPointerOutside: true,
      dismissOnFocusOutside: true,
      dismissOnEscape: true,
      onDismiss: () => controller.actions.closeSubmenu(),
    });
    const submenuContent = resolve(submenu.content);
    const submenuTrigger = resolve(submenu.trigger);
    if (submenuContent) submenuBranchReleases.push(layer.addBranch(submenuContent));
    if (submenuTrigger) submenuBranchReleases.push(submenuLayer.addBranch(submenuTrigger));
    submenuLayers.set(submenu.id, submenuLayer);
  }

  const rootContent = content();
  if (!rootContent) throw new TypeError('Menu DOM binding requires a content element.');
  rootPresence = createUIFnPresence(scope, { element: content, present: controller.getState().open, initialAnimation: false });
  const portalNode = options.portalNode ?? positioner();
  if (portalNode && !options.portalManagedExternally) portal = createUIFnPortal(scope, { id: `${bindingId}-portal`, node: portalNode, target: options.portalTarget, disabled: options.portalDisabled });

  const rootReference = () => virtualAnchor(controller.getState()) ?? trigger();
  if (rootReference() && positioner()) {
    rootPositioner = createUIFnPositioner(scope, {
      reference: rootReference,
      floating: positioner,
      placement: controller.getState().primitive === 'ContextMenu' ? 'right-start' : 'bottom-start',
      strategy: controller.getState().primitive === 'ContextMenu' ? 'fixed' : 'absolute',
      autoUpdate: true,
      collisionPadding: 8,
    });
  }
  for (const submenu of submenus) {
    const reference = resolve(submenu.trigger);
    const floating = resolve(submenu.positioner) ?? resolve(submenu.content);
    if (!reference || !floating) continue;
    submenuPositioners.set(submenu.id, createUIFnPositioner(scope, {
      reference,
      floating,
      placement: controller.getState().dir === 'rtl' ? 'left-start' : 'right-start',
      autoUpdate: true,
      collisionPadding: 8,
    }));
  }

  const openRootResources = () => {
    if (!rootFocus) {
      rootFocus = platform.focusScopes.register({
        id: `${controller.getState().primitive.toLowerCase()}-root-focus`,
        container: content,
        trapped: false,
        loop: true,
        initialFocus: () => controller.getState().activeItem ? itemElement(controller.getState().activeItem as string) : content(),
        returnFocus: true,
        restoreFocus: trigger,
        fallbackFocus: trigger,
      });
    }
    rootPositioner?.start();
  };
  const closeRootResources = () => {
    submenuFocus.forEach((focus) => focus.destroy()); submenuFocus.clear();
    submenuPositioners.forEach((value) => value.stop());
    rootPositioner?.stop(); rootFocus?.destroy(); rootFocus = null;
  };
  const syncSubmenu = (submenu: UIFnSubmenuDomElements, active: boolean) => {
    submenuLayers.get(submenu.id)?.update({ enabled: active });
    if (active && !submenuFocus.has(submenu.id)) {
      const focus = platform.focusScopes.register({
        id: `${controller.getState().primitive.toLowerCase()}-${submenu.id}-focus`,
        container: () => resolve(submenu.content), trapped: false, loop: true,
        initialFocus: () => controller.getState().activeItem ? itemElement(controller.getState().activeItem as string) : resolve(submenu.content),
        returnFocus: true, restoreFocus: () => resolve(submenu.trigger), fallbackFocus: content,
      });
      submenuFocus.set(submenu.id, focus); submenuPositioners.get(submenu.id)?.start();
    } else if (!active && submenuFocus.has(submenu.id)) {
      submenuFocus.get(submenu.id)?.destroy(); submenuFocus.delete(submenu.id); submenuPositioners.get(submenu.id)?.stop();
    }
  };
  const sync = () => {
    if (destroyed) return;
    const state = controller.getState();
    layer.update({ enabled: state.open });
    rootPresence?.update({ present: state.open });
    if (state.open && !open) openRootResources(); else if (!state.open && open) closeRootResources();
    open = state.open;
    submenus.forEach((submenu) => syncSubmenu(submenu, state.open && state.submenuPath.includes(submenu.id)));
    if (state.open && state.activeItem) {
      scope.requestAnimationFrame(() => {
        const target = itemElement(state.activeItem as string);
        if (target && scope.getActiveElement() !== target) target.focus({ preventScroll: true });
      });
    }
  };

  const releasePointerOut = scope.on('pointerout', (raw) => {
    const event = raw as PointerEvent;
    const submenu = submenus.find((entry) => resolve(entry.trigger) === event.target || resolve(entry.trigger)?.contains(event.target as Node));
    if (!submenu || !controller.getState().submenuPath.includes(submenu.id)) return;
    const submenuContent = resolve(submenu.content);
    if (!submenuContent || (event.relatedTarget instanceof Node && submenuContent.contains(event.relatedTarget))) return;
    grace = { id: submenu.id, triangle: graceTriangle({ x: event.clientX, y: event.clientY }, submenuContent.getBoundingClientRect()) };
    cancelGrace();
    cancelGrace = scope.setTimeout(() => { if (grace?.id === submenu.id) controller.actions.closeSubmenu(); grace = null; }, options.pointerGraceDelay ?? 300);
  });
  const releasePointerMove = scope.on('pointermove', (raw) => {
    const event = raw as PointerEvent;
    if (event.pointerType === 'touch' && touchOrigin && Math.hypot(event.clientX - touchOrigin.x, event.clientY - touchOrigin.y) > 10) {
      cancelLongPress(); touchOrigin = null;
    }
    if (!grace) return;
    const submenu = submenuFor(grace.id); const submenuContent = submenu ? resolve(submenu.content) : null;
    if (submenuContent?.contains(event.target as Node)) { cancelGrace(); grace = null; return; }
    if (isUIFnPointInPointerGraceTriangle({ x: event.clientX, y: event.clientY }, grace.triangle)) {
      cancelGrace();
      cancelGrace = () => undefined;
      return;
    }
    cancelGrace();
    cancelGrace = scope.setTimeout(() => { controller.actions.closeSubmenu(); grace = null; }, 40);
  });
  const releasePointerDown = scope.on('pointerdown', (raw) => {
    const event = raw as PointerEvent;
    if (controller.getState().primitive !== 'ContextMenu' || event.pointerType !== 'touch' || !trigger()?.contains(event.target as Node)) return;
    cancelLongPress(); touchOrigin = { x: event.clientX, y: event.clientY };
    cancelLongPress = scope.setTimeout(() => {
      controller.actions.openAt(event.clientX, event.clientY, 'touch');
      touchOrigin = null;
    }, options.longPressDelay ?? 700);
  });
  const cancelTouch = () => { cancelLongPress(); touchOrigin = null; };
  const releasePointerUp = scope.on('pointerup', cancelTouch);
  const releasePointerCancel = scope.on('pointercancel', cancelTouch);
  const unsubscribe = controller.subscribe(() => sync(), { emitInitial: false });
  sync();

  return {
    get open() { return open; },
    get destroyed() { return destroyed; },
    get layerIds() { return [layer.id, ...[...submenuLayers.values()].map((entry) => entry.id)]; },
    update: sync,
    destroy() {
      if (destroyed) return; destroyed = true;
      cancelLongPress(); cancelGrace(); unsubscribe();
      releasePointerOut(); releasePointerMove(); releasePointerDown(); releasePointerUp(); releasePointerCancel();
      closeRootResources(); rootPositioner?.destroy(); rootPresence?.destroy(); portal?.destroy();
      submenuPositioners.forEach((value) => value.destroy()); submenuPositioners.clear();
      submenuLayers.forEach((value) => value.destroy()); submenuLayers.clear();
      submenuBranchReleases.forEach((release) => release()); releaseTriggerBranch(); layer.destroy();
    },
  };
}

/** Executes NavigationMenu delay and skip-delay intent using the shared tracked scheduler. */
export function createUIFnNavigationMenuDomBinding(options: UIFnNavigationMenuDomBindingOptions): UIFnNavigationMenuDomBinding {
  const { scope } = options.platform;
  scope.assertAlive('create navigation menu DOM binding');
  let destroyed = false;
  let cancelIntent: () => void = () => undefined;
  const sync = () => {
    if (destroyed) return;
    cancelIntent(); cancelIntent = () => undefined;
    const intent = options.controller.getState().pendingIntent;
    if (!intent) return;
    cancelIntent = scope.setTimeout(() => options.controller.actions.commitIntent(intent.type, intent.value), intent.delay);
  };
  const unsubscribe = options.controller.subscribe(() => sync(), { emitInitial: false });
  sync();
  return {
    get destroyed() { return destroyed; }, update: sync,
    destroy() { if (destroyed) return; destroyed = true; cancelIntent(); unsubscribe(); },
  };
}

/** Shared DOM focus executor for roving-tabindex and aria-activedescendant controllers. */
export function createUIFnRovingFocusDomBinding<TState>(
  options: UIFnRovingFocusDomBindingOptions<TState>,
): UIFnRovingFocusDomBinding {
  const { scope } = options.platform;
  scope.assertAlive('create roving focus DOM binding');
  let destroyed = false;
  let cancelFrame: () => void = () => undefined;
  let initialized = false;
  const sync = (meta?: Readonly<UIFnChangeMeta<any, TState>>) => {
    if (destroyed) return;
    const firstSync = !initialized;
    initialized = true;
    const focusRequested = firstSync
      ? options.focusInitial !== false
      : meta?.inputModality === 'keyboard' || meta?.inputModality === 'virtual';
    // Controlled/programmatic value synchronization must never steal focus.
    // Pointer and touch interactions already receive native browser focus;
    // only keyboard/virtual navigation needs an imperative transfer.
    if (!focusRequested) return;
    cancelFrame();
    const key = options.getActiveKey(options.controller.getState());
    if (!key) return;
    cancelFrame = scope.requestAnimationFrame(() => {
      const element = options.getElement(key);
      if (element?.isConnected && scope.getActiveElement() !== element) element.focus({ preventScroll: true });
    });
  };
  const unsubscribe = options.controller.subscribe((_state, meta) => sync(meta), { emitInitial: false });
  sync();
  return {
    get destroyed() { return destroyed; }, update: sync,
    destroy() { if (destroyed) return; destroyed = true; cancelFrame(); unsubscribe(); },
  };
}
