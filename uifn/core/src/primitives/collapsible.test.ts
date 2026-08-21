import { describe, expect, it, vi } from 'vitest';
import { createCollapsibleRuntime } from './collapsible';

describe('collapsible primitive', () => {
  it('supports open/close transitions', () => {
    const collapsible = createCollapsibleRuntime({ defaultOpen: false });
    expect(collapsible.state.open).toBe(false);

    collapsible.actions.toggle();
    expect(collapsible.state.open).toBe(true);

    collapsible.actions.setOpen(false);
    expect(collapsible.state.open).toBe(false);
  });

  it('ignores interactions when disabled', () => {
    const collapsible = createCollapsibleRuntime({ defaultOpen: false, disabled: true });
    collapsible.actions.toggle();

    expect(collapsible.state.open).toBe(false);
    expect(collapsible.state.lastError?.code).toBe('UIFN_ERR_DISABLED_INTERACTION');
  });

  it('keeps controlled open state stable until syncOpen is applied', () => {
    const onOpenChange = vi.fn();
    const collapsible = createCollapsibleRuntime({
      open: false,
      onOpenChange,
    });

    collapsible.actions.toggle();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(collapsible.state.open).toBe(false);

    collapsible.actions.syncOpen(true);
    expect(collapsible.state.open).toBe(true);
  });
});
