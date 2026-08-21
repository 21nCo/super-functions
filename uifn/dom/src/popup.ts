import type { UIFnController } from '@uifn/core';
import type { UIFnDomPlatform } from './platform';
import { createUIFnPortal, type UIFnPortalHandle, type UIFnPortalTarget } from './portal';
import {
  createUIFnPositioner,
  type UIFnPlacement,
  type UIFnPositioner,
  type UIFnPositionStrategy,
} from './positioning';

type ResolveElement = HTMLElement | (() => HTMLElement | null) | null;
type PopupController = UIFnController<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
>;

export interface UIFnPopupDomBindingOptions {
  readonly platform: UIFnDomPlatform;
  readonly controller: PopupController;
  readonly id: string;
  readonly trigger: ResolveElement;
  readonly content: ResolveElement;
  readonly positioner?: ResolveElement;
  readonly reference?: ResolveElement;
  readonly placement?: UIFnPlacement;
  readonly strategy?: UIFnPositionStrategy;
  readonly sideOffset?: number;
  readonly collisionPadding?: number;
  readonly matchReferenceWidth?: boolean;
  readonly closeOnPointerOutside?: boolean;
  readonly closeOnFocusOutside?: boolean;
  readonly closeOnEscape?: boolean;
  readonly restoreFocus?: boolean;
  readonly portalNode?: Node | null;
  readonly portalTarget?: UIFnPortalTarget;
  readonly portalDisabled?: boolean;
  readonly portalManagedExternally?: boolean;
  readonly getOpen: (state: Record<string, unknown>) => boolean;
  readonly setOpen: (open: boolean) => void;
}

export interface UIFnPopupDomBinding {
  readonly open: boolean;
  readonly destroyed: boolean;
  update(): void;
  destroy(): void;
}

function resolve(value: ResolveElement | undefined): HTMLElement | null {
  return typeof value === 'function' ? value() : value ?? null;
}

/**
 * Owns the browser behavior shared by non-modal popup primitives such as
 * Select, Combobox, DatePicker, and ColorPicker.
 *
 * Core remains DOM-free: it publishes open state and events. Framework
 * adapters render parts and refs. This service owns portalling, collision-aware
 * positioning, outside/escape dismissal, and focus restoration.
 */
export function createUIFnPopupDomBinding(
  options: UIFnPopupDomBindingOptions,
): UIFnPopupDomBinding {
  const { platform, controller } = options;
  const { scope } = platform;
  scope.assertAlive('create popup DOM binding');
  let destroyed = false;
  let open = false;
  let positioner: UIFnPositioner | null = null;
  let portal: UIFnPortalHandle | null = null;
  let cancelDeferredStart: () => void = () => undefined;

  const trigger = () => resolve(options.trigger);
  const reference = () => resolve(options.reference) ?? trigger();
  const content = () => resolve(options.content);
  const floating = () => resolve(options.positioner) ?? content();

  const floatingElement = floating();
  if (!content() || !floatingElement) {
    throw new TypeError('Popup DOM binding requires content and floating elements.');
  }

  const layer = platform.layers.register({
    id: `${options.id}-layer`,
    element: content,
    enabled: false,
    dismissOnPointerOutside: options.closeOnPointerOutside ?? true,
    dismissOnFocusOutside: options.closeOnFocusOutside ?? true,
    dismissOnEscape: options.closeOnEscape ?? true,
    onDismiss: () => options.setOpen(false),
  });
  let triggerBranch: HTMLElement | null = null;
  let releaseTriggerBranch: () => void = () => undefined;
  const syncTriggerBranch = () => {
    const nextTrigger = trigger();
    if (nextTrigger === triggerBranch) return;
    releaseTriggerBranch();
    triggerBranch = nextTrigger;
    releaseTriggerBranch = nextTrigger
      ? layer.addBranch(nextTrigger)
      : () => undefined;
  };
  syncTriggerBranch();

  const portalNode = options.portalNode ?? floatingElement;
  if (portalNode && !options.portalManagedExternally) {
    portal = createUIFnPortal(scope, {
      id: `${options.id}-portal`,
      node: portalNode,
      target: options.portalTarget,
      disabled: options.portalDisabled,
      registerBranch(element) {
        return layer.addBranch(element);
      },
    });
  }

  if (reference() && floating()) {
    positioner = createUIFnPositioner(scope, {
      reference,
      floating,
      placement: options.placement ?? 'bottom-start',
      strategy: options.strategy ?? 'fixed',
      sideOffset: options.sideOffset ?? 6,
      collisionPadding: options.collisionPadding ?? 8,
      autoUpdate: true,
      onUpdate(result) {
        const node = floating();
        if (!node) return;
        node.dataset.side = result.placement.split('-')[0] ?? 'bottom';
        node.dataset.align = result.placement.split('-')[1] ?? 'center';
        if (options.matchReferenceWidth) {
          const referenceWidth = reference()?.getBoundingClientRect().width ?? 0;
          if (referenceWidth > 0) node.style.minInlineSize = `${referenceWidth}px`;
        }
      },
    });
  }

  const openResources = () => {
    layer.bringToFront();
    cancelDeferredStart();
    const floatingNode = floating();
    if (floatingNode) delete floatingNode.dataset.uifnPositioned;
    // Frameworks publish controller state before committing `hidden=false`.
    // Defer one task so Floating UI measures the visible, portalled surface.
    cancelDeferredStart = scope.setTimeout(() => {
      cancelDeferredStart = () => undefined;
      if (!destroyed && options.getOpen(controller.getState())) {
        positioner?.start();
        void positioner?.update().catch((error) => scope.environment.error(error));
      }
    }, 0);
  };

  const refreshOpenResources = () => {
    cancelDeferredStart();
    // Framework commits can re-project a part's `style` attribute after core
    // publishes a value update. Rebind after that commit so imperative
    // Floating UI coordinates are re-applied to the current reference and
    // floating nodes instead of leaving an open popup in normal document flow.
    cancelDeferredStart = scope.setTimeout(() => {
      cancelDeferredStart = scope.requestAnimationFrame(() => {
        cancelDeferredStart = () => undefined;
        if (destroyed || !options.getOpen(controller.getState())) return;
        positioner?.stop();
        positioner?.start();
        void positioner?.update().catch((error) => scope.environment.error(error));
      });
    }, 0);
  };

  const closeResources = () => {
    cancelDeferredStart();
    cancelDeferredStart = () => undefined;
    positioner?.stop();
    const floatingNode = floating();
    if (floatingNode) delete floatingNode.dataset.uifnPositioned;
    const contentElement = content();
    if (
      options.restoreFocus !== false
      && contentElement?.contains(scope.getActiveElement())
    ) {
      trigger()?.focus({ preventScroll: true });
    }
  };

  const sync = () => {
    if (destroyed) return;
    // Compound adapters may replace part nodes while publishing controller
    // state. Keep the trigger branch and layer resolvers attached to the
    // currently committed elements so an in-popup pointer event is never
    // misclassified as outside after a value update.
    syncTriggerBranch();
    const nextOpen = options.getOpen(controller.getState());
    layer.update({
      enabled: nextOpen,
      dismissOnPointerOutside: options.closeOnPointerOutside ?? true,
      dismissOnFocusOutside: options.closeOnFocusOutside ?? true,
      dismissOnEscape: options.closeOnEscape ?? true,
    });
    if (nextOpen && !open) openResources();
    else if (nextOpen && open) refreshOpenResources();
    else if (!nextOpen && open) closeResources();
    open = nextOpen;
  };

  const unsubscribe = controller.subscribe(sync, { emitInitial: false });
  try {
    sync();
  } catch (error) {
    unsubscribe();
    releaseTriggerBranch();
    positioner?.destroy();
    portal?.destroy();
    layer.destroy();
    throw error;
  }

  return {
    get open() {
      return open;
    },
    get destroyed() {
      return destroyed;
    },
    update: sync,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelDeferredStart();
      unsubscribe();
      closeResources();
      releaseTriggerBranch();
      positioner?.destroy();
      portal?.destroy();
      layer.destroy();
    },
  };
}
