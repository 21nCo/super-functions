import { describe, expect, it, vi } from 'vitest';
import { UIFnError } from '../errors';
import {
  UIFN_OVERLAY_POLICIES,
  assertUIFnAlertDialogDismissal,
  assertUIFnOverlayAccessibleName,
  createAlertDialogController,
  createDialogController,
  createDrawerController,
  createFloatingPanelController,
  createHoverCardController,
  createPopoverController,
  createTooltipController,
  createTourController,
} from '../primitives';

const env = (name: string) => ({ generateId: (scope: string) => `${scope}-${name}` });

describe('PHASE_07 overlay policies and controllers', () => {
  it('TV-PRIM-002-P declares distinct reviewed policy for all eight primitives', () => {
    expect(Object.keys(UIFN_OVERLAY_POLICIES)).toEqual([
      'AlertDialog', 'Dialog', 'Drawer', 'FloatingPanel',
      'HoverCard', 'Popover', 'Tooltip', 'Tour',
    ]);
    expect(UIFN_OVERLAY_POLICIES.AlertDialog).toMatchObject({
      modalDefault: true,
      initialFocus: 'cancel',
      closeOnPointerOutside: false,
      preventOutsideInteraction: true,
      nameRule: 'title-or-aria-label-required',
    });
    expect(UIFN_OVERLAY_POLICIES.Tooltip).toMatchObject({
      modalDefault: false,
      interaction: 'hover-focus',
      touchOpens: false,
      trapFocus: false,
      nameRule: 'tooltip-description-required',
    });
    expect(UIFN_OVERLAY_POLICIES.HoverCard.hoverableContent).toBe(true);
    expect(UIFN_OVERLAY_POLICIES.Popover.position).toBe('anchor');
    expect(UIFN_OVERLAY_POLICIES.Tour.position).toBe('target');
  });

  it('exposes complete canonical anatomy for every overlay family', () => {
    const controllers = [
      createAlertDialogController({}, env('alert')),
      createDialogController({}, env('dialog')),
      createDrawerController({}, env('drawer')),
      createFloatingPanelController({}, env('panel')),
      createHoverCardController({}, env('hover')),
      createPopoverController({}, env('popover')),
      createTooltipController({}, env('tooltip')),
      createTourController({ steps: [{ id: 'one', title: 'One', target: '#one' }] }, env('tour')),
    ];
    const anatomy = controllers.map((controller) => Object.keys(controller.parts));
    expect(anatomy).toEqual([
      ['root', 'trigger', 'portal', 'backdrop', 'positioner', 'content', 'title', 'description', 'cancel', 'action', 'close'],
      ['root', 'trigger', 'portal', 'backdrop', 'positioner', 'content', 'title', 'description', 'close'],
      ['root', 'trigger', 'portal', 'backdrop', 'positioner', 'content', 'handle', 'title', 'description', 'close'],
      ['root', 'trigger', 'positioner', 'content', 'header', 'title', 'description', 'dragHandle', 'resizeHandle', 'close'],
      ['root', 'trigger', 'positioner', 'content', 'arrow'],
      ['root', 'anchor', 'trigger', 'positioner', 'content', 'title', 'description', 'arrow', 'close'],
      ['root', 'trigger', 'positioner', 'content', 'arrow'],
      ['root', 'portal', 'backdrop', 'spotlight', 'positioner', 'content', 'title', 'description', 'previous', 'next', 'skip', 'close', 'progress'],
    ]);
    controllers.forEach((controller) => controller.destroy());
  });

  it('keeps controlled open requests separate from committed updates for every family', () => {
    const callbacks = Array.from({ length: 8 }, () => vi.fn());
    const controllers = [
      createAlertDialogController({ open: false, onOpenChange: callbacks[0] }),
      createDialogController({ open: false, onOpenChange: callbacks[1] }),
      createDrawerController({ open: false, onOpenChange: callbacks[2] }),
      createFloatingPanelController({ open: false, onOpenChange: callbacks[3] }),
      createHoverCardController({ open: false, onOpenChange: callbacks[4], openDelay: 0 }),
      createPopoverController({ open: false, onOpenChange: callbacks[5] }),
      createTooltipController({ open: false, onOpenChange: callbacks[6], delayDuration: 0 }),
      createTourController({ open: false, onOpenChange: callbacks[7], steps: [{ id: 'one', title: 'One', target: '#one' }] }),
    ];
    controllers.forEach((controller, index) => {
      controller.actions.setOpen(true);
      expect(callbacks[index]).toHaveBeenCalledWith(true);
      expect(controller.state.open).toBe(false);
      controller.actions.syncOpen(true);
      expect(controller.state.open).toBe(true);
      expect(callbacks[index]).toHaveBeenCalledTimes(1);
      controller.destroy();
    });
  });

  it('implements drawer drag, floating panel move/resize, and tour lifecycle', () => {
    const drawer = createDrawerController({ defaultOpen: true, dismissThreshold: 0.5 });
    drawer.actions.dragStart();
    drawer.actions.dragMove(0.6);
    expect(drawer.actions.dragEnd()).toBe(true);
    expect(drawer.state.open).toBe(false);

    const panel = createFloatingPanelController({ defaultOpen: true, defaultSize: { width: 300, height: 200 } });
    panel.actions.dragStart();
    panel.actions.dragMove({ x: 10, y: 15 });
    panel.actions.dragEnd();
    panel.actions.resizeStart();
    panel.actions.resizeMove({ width: 40, height: -20 });
    panel.actions.resizeEnd();
    expect(panel.state.position).toEqual({ x: 10, y: 15 });
    expect(panel.state.size).toEqual({ width: 340, height: 180 });
    const preventDefault = vi.fn();
    panel.parts.resizeHandle.getProps('south-east').on?.keydown?.({
      type: 'keydown',
      key: 'ArrowRight',
      preventDefault,
    });
    expect(panel.state.size).toEqual({ width: 341, height: 180 });
    expect(preventDefault).toHaveBeenCalledOnce();

    const onComplete = vi.fn();
    const tour = createTourController({
      defaultOpen: true,
      onComplete,
      steps: [
        { id: 'one', title: 'One', target: '#one' },
        { id: 'two', title: 'Two', target: '#two' },
      ],
    });
    tour.actions.next();
    expect(tour.state.step).toBe(1);
    tour.actions.next();
    expect(tour.state.open).toBe(false);
    expect(tour.state.tourPhase).toBe('complete');
    expect(onComplete).toHaveBeenCalledOnce();
    drawer.destroy();
    panel.destroy();
    tour.destroy();
  });

  it('TV-PRIM-002-N emits exact AlertDialog dismissal and name errors', () => {
    expect(() => assertUIFnAlertDialogDismissal(true, false)).toThrowError(UIFnError);
    try {
      assertUIFnAlertDialogDismissal(true, false);
    } catch (error) {
      expect((error as UIFnError).code).toBe('UIFN_ALERT_DIALOG_DISMISSAL');
    }
    expect(() => assertUIFnOverlayAccessibleName(UIFN_OVERLAY_POLICIES.AlertDialog, {})).toThrowError(UIFnError);
    try {
      assertUIFnOverlayAccessibleName(UIFN_OVERLAY_POLICIES.AlertDialog, {});
    } catch (error) {
      expect((error as UIFnError).code).toBe('UIFN_ACCESSIBLE_NAME_MISSING');
    }
  });

  it('rejects AlertDialog outside-dismiss configuration at construction', () => {
    expect(() => createAlertDialogController({ closeOnInteractOutside: true } as never)).toThrowError(UIFnError);
    try {
      createAlertDialogController({ closeOnInteractOutside: true } as never);
    } catch (error) {
      expect((error as UIFnError).code).toBe('UIFN_ALERT_DIALOG_DISMISSAL');
    }
  });
});
