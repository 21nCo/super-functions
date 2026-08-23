import {
  assertUIFnOverlayAccessibleName,
  type UIFnOverlayBaseActions,
  type UIFnOverlayBaseState,
  type UIFnOverlayPlacement,
} from '@uifn/core/primitives/overlay';
import type { UIFnController } from '@uifn/core/controller';
import type { UIFnPartProps } from '@uifn/core/parts';
import type { UIFnFocusScopeHandle } from './focus-scope';
import type { UIFnDismissableLayerHandle } from './layers';
import type { UIFnModalHandle } from './modal';
import type { UIFnDomPlatform } from './platform';
import { createUIFnPortal, type UIFnPortalHandle, type UIFnPortalTarget } from './portal';
import { createUIFnPositioner, type UIFnPositioner, type UIFnVirtualAnchor } from './positioning';
import { createUIFnPresence, type UIFnPresence, type UIFnPresenceState } from './presence';

export interface UIFnOverlayBindableController<TState extends UIFnOverlayBaseState = UIFnOverlayBaseState>
  extends Pick<UIFnController<TState, UIFnOverlayBaseActions, object, object>,
  'state' | 'actions' | 'getState' | 'subscribe'> {}

export interface UIFnOverlayDomBindingOptions<TState extends UIFnOverlayBaseState = UIFnOverlayBaseState> {
  readonly platform: UIFnDomPlatform;
  readonly controller: UIFnOverlayBindableController<TState>;
  readonly content: HTMLElement | (() => HTMLElement | null);
  readonly trigger?: HTMLElement | (() => HTMLElement | null) | null;
  readonly positioner?: HTMLElement | (() => HTMLElement | null) | null;
  readonly reference?: Element | UIFnVirtualAnchor | (() => Element | UIFnVirtualAnchor | null) | null;
  readonly arrow?: HTMLElement | (() => HTMLElement | null) | null;
  readonly portalNode?: Node | null;
  readonly portalTarget?: UIFnPortalTarget;
  readonly portalDisabled?: boolean;
  /** The framework renderer owns DOM placement; DOM services still own layers, focus, presence, and positioning. */
  readonly portalManagedExternally?: boolean;
  readonly parent?: UIFnOverlayDomBinding | null;
  readonly branches?: readonly Element[];
  readonly initialFocus?: HTMLElement | (() => HTMLElement | null) | null;
  readonly fallbackFocus?: HTMLElement | (() => HTMLElement | null) | null;
  readonly forceMount?: boolean;
  readonly sideOffset?: number;
  readonly alignOffset?: number;
  readonly collisionPadding?: number;
  readonly strategy?: 'absolute' | 'fixed';
  readonly validateAccessibleName?: boolean;
  readonly onPresenceChange?: (state: UIFnPresenceState) => void;
  readonly onPosition?: (position: { x: number; y: number; placement: UIFnOverlayPlacement }) => void;
}

export interface UIFnOverlayDomBinding {
  readonly open: boolean;
  readonly destroyed: boolean;
  readonly layerId: string;
  readonly presenceState: UIFnPresenceState;
  addBranch(element: Element): () => void;
  update(): void;
  destroy(): void;
}

function resolve<T>(value: T | (() => T | null) | null | undefined): T | null {
  return typeof value === 'function' ? (value as () => T | null)() : value ?? null;
}

function partTarget(
  state: UIFnOverlayBaseState,
  content: HTMLElement,
  configured: HTMLElement | (() => HTMLElement | null) | null | undefined,
): HTMLElement | null {
  const explicit = resolve(configured);
  if (explicit) return explicit;
  if (state.initialFocusId) {
    const byId = content.ownerDocument.getElementById(state.initialFocusId);
    if (byId instanceof HTMLElement) return byId;
  }
  if (state.policy.initialFocus === 'cancel') {
    return content.ownerDocument.getElementById(state.ids.cancelId) as HTMLElement | null;
  }
  if (state.policy.initialFocus === 'next') {
    return content.querySelector<HTMLElement>('[data-uifn-part="next"]')
      ?? content.ownerDocument.getElementById(`${state.ids.contentId}-next`) as HTMLElement | null;
  }
  if (state.policy.initialFocus === 'content') return content;
  return null;
}

function elementNode(value: Node | null | undefined): Element | null {
  return value?.nodeType === 1 ? value as Element : null;
}

function accessibleNameEvidence(content: HTMLElement) {
  const root = content.getRootNode();
  const queryRoot = root as Node & {
    getElementById?: (id: string) => Element | null;
    querySelectorAll?: (selector: string) => NodeListOf<Element>;
  };
  const labelledText = (content.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) ?? [])
    .map((id) => {
      const direct = queryRoot.getElementById?.(id);
      const fallback = direct ?? Array.from(queryRoot.querySelectorAll?.('[id]') ?? [])
        .find((element) => element.id === id);
      return fallback?.textContent ?? '';
    });
  return {
    ariaLabel: content.getAttribute('aria-label'),
    labelledText,
    contentText: content.textContent,
  };
}

/**
 * Executes a core overlay policy exclusively through the shared DOM platform.
 * Framework adapters render parts and refs; this service owns all browser work.
 */
export function createUIFnOverlayDomBinding<TState extends UIFnOverlayBaseState>(
  options: UIFnOverlayDomBindingOptions<TState>,
): UIFnOverlayDomBinding {
  const { platform, controller } = options;
  const { scope } = platform;
  scope.assertAlive('create overlay DOM binding');
  let destroyed = false;
  let open = false;
  let focusScope: UIFnFocusScopeHandle | null = null;
  let modal: UIFnModalHandle | null = null;
  let portal: UIFnPortalHandle | null = null;
  let positioner: UIFnPositioner | null = null;
  let presence: UIFnPresence | null = null;
  let cancelDelay: () => void = () => undefined;
  let releaseParentBranch: () => void = () => undefined;
  const branchSet = new Set<Element>(options.branches ?? []);
  const dynamicBranchReleases = new Map<Element, Array<() => void>>();

  const content = () => resolve(options.content);
  const trigger = () => resolve(options.trigger);
  const floating = () => resolve(options.positioner) ?? content();
  const state = () => controller.getState();
  const policy = state().policy;

  const layer: UIFnDismissableLayerHandle = platform.layers.register({
    id: `${state().ids.rootId}-layer`,
    element: content,
    enabled: false,
    dismissOnPointerOutside: false,
    dismissOnFocusOutside: false,
    dismissOnEscape: false,
    onPointerDownOutside(event) {
      const current = state();
      if (current.policy.preventOutsideInteraction || !current.closeOnInteractOutside) event.preventDefault();
    },
    onFocusOutside(event) {
      const current = state();
      if (current.policy.preventOutsideInteraction || !current.closeOnInteractOutside) event.preventDefault();
    },
    onDismiss(reason) {
      if (reason === 'escape') controller.actions.onEscapeKeyDown();
      else controller.actions.onOutsideInteraction(reason === 'focus-outside' ? 'focus' : 'pointer');
    },
  });

  const addBranch = (element: Element): (() => void) => {
    if (destroyed || branchSet.has(element)) return () => undefined;
    branchSet.add(element);
    const releases = [layer.addBranch(element)];
    if (element instanceof HTMLElement) releases.push(focusScope?.addBranch(element) ?? (() => undefined));
    releases.push(modal?.addBranch(element) ?? (() => undefined));
    dynamicBranchReleases.set(element, releases);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      dynamicBranchReleases.get(element)?.forEach((release) => release());
      dynamicBranchReleases.delete(element);
      branchSet.delete(element);
    };
  };

  for (const branch of branchSet) layer.addBranch(branch);
  const triggerElement = trigger();
  if (triggerElement) layer.addBranch(triggerElement);

  const portalNode = options.portalNode ?? floating();
  if (portalNode && policy.portal && !options.portalManagedExternally) {
    portal = createUIFnPortal(scope, {
      id: state().ids.portalId,
      node: portalNode,
      target: options.portalTarget,
      disabled: options.portalDisabled,
      registerBranch(element) {
        releaseParentBranch();
        const releases = [options.parent?.addBranch(element) ?? (() => undefined)];
        const root = element.getRootNode();
        if (root instanceof ShadowRoot) releases.push(options.parent?.addBranch(root.host) ?? (() => undefined));
        releaseParentBranch = () => releases.forEach((release) => release());
        return () => {
          releaseParentBranch();
          releaseParentBranch = () => undefined;
        };
      },
    });
  } else if (options.parent) {
    const branch = elementNode(portalNode) ?? content();
    if (branch) releaseParentBranch = options.parent.addBranch(branch);
  }

  const contentElement = content();
  if (!contentElement) throw new TypeError('Overlay DOM binding requires a content element.');
  presence = createUIFnPresence(scope, {
    element: content,
    present: state().open,
    forceMount: options.forceMount ?? state().forceMount,
    initialAnimation: false,
    onStateChange(next) {
      controller.actions.setPresencePhase(
        next === 'entering' ? 'opening'
          : next === 'entered' ? 'open'
            : next === 'exiting' ? 'closing'
              : 'closed',
      );
      options.onPresenceChange?.(next);
    },
  });

  const ensurePositioner = () => {
    const reference = options.reference ?? trigger;
    if (positioner || policy.position === 'none' || !resolve(reference) || !floating()) return;
    positioner = createUIFnPositioner(scope, {
      reference,
      floating,
      arrow: options.arrow,
      placement: state().placement,
      strategy: options.strategy,
      sideOffset: options.sideOffset,
      alignOffset: options.alignOffset,
      collisionPadding: options.collisionPadding,
      autoUpdate: true,
      onUpdate(result) {
        options.onPosition?.({ x: result.x, y: result.y, placement: result.placement });
      },
    });
  };
  ensurePositioner();

  const reconcileOpenResources = () => {
    const current = state();
    const node = content();
    if (!node) return;
    if (options.validateAccessibleName !== false) {
      assertUIFnOverlayAccessibleName(current.policy, accessibleNameEvidence(node));
    }
    const needsFocusScope = current.trapFocus
      || current.policy.restoreFocus
      || current.policy.initialFocus !== 'none';
    const focusOptions = {
      container: node,
      trapped: current.trapFocus,
      loop: current.trapFocus && current.policy.loopFocus,
      initialFocus: partTarget(current, node, options.initialFocus),
      returnFocus: current.policy.restoreFocus,
      restoreFocus: trigger,
      fallbackFocus: options.fallbackFocus ?? trigger,
    };
    if (!focusScope && needsFocusScope) {
      focusScope = platform.focusScopes.register({
        id: `${current.ids.rootId}-focus`,
        ...focusOptions,
        branches: [...branchSet].filter((branch): branch is HTMLElement => branch instanceof HTMLElement),
        // Framework renderers commit `hidden`, presence, and portal changes
        // after the controller notification that opens the overlay. Deferring
        // one task lets those DOM mutations settle before tabbable discovery.
        deferInitialFocus: true,
      });
    } else if (focusScope && needsFocusScope) {
      focusScope.update(focusOptions);
    } else if (focusScope) {
      focusScope.destroy();
      focusScope = null;
    }
    if (!modal && current.modal) {
      modal = platform.modals.acquire({
        id: `${current.ids.rootId}-modal`,
        content: node,
        branches: [...branchSet],
        isolate: current.policy.isolateBackground,
        disableOutsidePointerEvents: current.policy.preventOutsideInteraction || current.modal,
        lockScroll: current.scrollLock,
      });
    } else if (modal && current.modal) {
      modal.update({
        content: node,
        isolate: current.policy.isolateBackground,
        disableOutsidePointerEvents: current.policy.preventOutsideInteraction || current.modal,
        lockScroll: current.scrollLock,
      });
    } else if (modal) {
      modal.destroy();
      modal = null;
    }
    ensurePositioner();
    void positioner?.update({
      reference: options.reference ?? trigger,
      floating,
      arrow: options.arrow,
      placement: current.placement,
      strategy: options.strategy,
      sideOffset: options.sideOffset,
      alignOffset: options.alignOffset,
      collisionPadding: options.collisionPadding,
      autoUpdate: true,
    }).catch((error) => scope.environment.error(error));
    positioner?.start();
  };

  const closeResources = () => {
    positioner?.stop();
    modal?.destroy();
    modal = null;
    focusScope?.destroy();
    focusScope = null;
  };

  const schedulePending = () => {
    cancelDelay();
    cancelDelay = () => undefined;
    const current = state();
    const delay = current.pendingOpenMs ?? current.pendingCloseMs;
    if (delay === null) return;
    cancelDelay = scope.setTimeout(() => controller.actions.advanceTime(delay), delay);
  };

  const sync = () => {
    if (destroyed) return;
    const current = state();
    layer.update({
      enabled: current.open,
      dismissOnPointerOutside: current.policy.closeOnPointerOutside && current.closeOnInteractOutside,
      dismissOnFocusOutside: current.policy.closeOnFocusOutside && current.closeOnInteractOutside,
      dismissOnEscape: current.closeOnEscape,
    });
    presence?.update({ present: current.open, forceMount: options.forceMount ?? current.forceMount });
    if (current.open) reconcileOpenResources();
    else if (!current.open && open) closeResources();
    open = current.open;
    schedulePending();
  };

  const unsubscribe = controller.subscribe(() => sync(), { emitInitial: false });
  try {
    sync();
  } catch (error) {
    unsubscribe();
    releaseParentBranch();
    (positioner as UIFnPositioner | null)?.destroy();
    presence?.destroy();
    portal?.destroy();
    layer.destroy();
    throw error;
  }

  return {
    get open() { return open; },
    get destroyed() { return destroyed; },
    layerId: layer.id,
    get presenceState() { return presence?.state ?? 'unmounted'; },
    addBranch,
    update: sync,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelDelay();
      unsubscribe();
      dynamicBranchReleases.forEach((releases) => releases.forEach((release) => release()));
      dynamicBranchReleases.clear();
      releaseParentBranch();
      closeResources();
      positioner?.destroy();
      presence?.destroy();
      portal?.destroy();
      layer.destroy();
      branchSet.clear();
      scope.environment.trace({
        kind: 'dom-overlay',
        operation: 'destroy',
        timestamp: scope.environment.now(),
        details: { primitive: policy.primitive, layerId: layer.id },
      });
    },
  };
}

export function applyUIFnPartProps(element: HTMLElement, props: UIFnPartProps): () => void {
  const releases: Array<() => void> = [];
  const setAttribute = (name: string, value: string) => {
    const previous = element.getAttribute(name);
    element.setAttribute(name, value);
    releases.push(() => previous === null ? element.removeAttribute(name) : element.setAttribute(name, previous));
  };
  if (props.id) setAttribute('id', props.id);
  if (props.role) setAttribute('role', props.role);
  if (props.tabIndex !== undefined) setAttribute('tabindex', String(props.tabIndex));
  if (props.hidden !== undefined) {
    const previous = element.hidden;
    element.hidden = props.hidden;
    releases.push(() => { element.hidden = previous; });
  }
  if (props.disabled !== undefined && 'disabled' in element) {
    const target = element as HTMLButtonElement;
    const previous = target.disabled;
    target.disabled = props.disabled;
    releases.push(() => { target.disabled = previous; });
  }
  for (const [name, value] of Object.entries(props.aria ?? {})) {
    if (value !== undefined && value !== null) setAttribute(`aria-${name}`, String(value));
  }
  for (const [name, value] of Object.entries(props.data ?? {})) {
    if (value !== undefined && value !== null) setAttribute(`data-${name}`, String(value));
  }
  for (const [name, value] of Object.entries(props.attributes ?? {})) {
    if (value !== undefined && value !== null) setAttribute(name, String(value));
  }
  for (const [name, handler] of Object.entries(props.on ?? {})) {
    if (!handler) continue;
    const eventName = name.toLowerCase();
    const listener = (event: Event) => handler(event as any);
    element.addEventListener(eventName, listener);
    releases.push(() => element.removeEventListener(eventName, listener));
  }
  return () => [...releases].reverse().forEach((release) => release());
}
