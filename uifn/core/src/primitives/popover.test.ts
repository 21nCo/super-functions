import { describe, expect, it, vi } from 'vitest';
import { createPopoverController } from './popover';

describe('popover primitive', () => {
  it('declares positioning policy without calculating DOM geometry in core', () => {
    const popover = createPopoverController({
      defaultOpen: true,
      side: 'bottom',
      align: 'center',
      sideOffset: 8,
    });

    expect(popover.state.policy.position).toBe('anchor');
    expect(popover.state.side).toBe('bottom');
    expect(popover.state.sideOffset).toBe(8);
    expect('computePosition' in popover.actions).toBe(false);
    expect(popover.parts.positioner.getProps().data?.placement).toBe('bottom');
  });

  it('leaves listener, timer, focus, and presence resources to the DOM platform', () => {
    const popover = createPopoverController({
      defaultOpen: true,
    });

    popover.actions.setOpen(false, 'close-outside-click');
    expect(popover.state.open).toBe(false);
    expect('cleanup' in popover.state).toBe(false);
    expect('registerTimer' in popover.actions).toBe(false);
    expect('registerListener' in popover.actions).toBe(false);
  });

  it('keeps controlled open state stable until syncOpen is applied', () => {
    const onOpenChange = vi.fn();
    const popover = createPopoverController({
      open: false,
      onOpenChange,
    });

    popover.actions.setOpen(true, 'open-trigger');
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(popover.state.open).toBe(false);

    popover.actions.syncOpen(true);
    expect(popover.state.open).toBe(true);
  });

  it('keeps fixed bases isolated to their explicit model scopes', () => {
    const first = createPopoverController({ idBase: 'shared-popover' });
    const second = createPopoverController({ idBase: 'shared-popover' });
    expect(first.state.ids).toEqual(second.state.ids);
  });
});
