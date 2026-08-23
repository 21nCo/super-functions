import { describe, expect, it, vi } from 'vitest';
import { createDialogController } from './dialog';

describe('dialog primitive', () => {
  it('applies modal focus and escape dismissal semantics', () => {
    const dialog = createDialogController({
      defaultOpen: false,
      modal: true,
      returnFocusId: 'dialog-trigger',
      scrollLock: false,
    });

    dialog.actions.open('open-trigger');
    expect(dialog.state.open).toBe(true);
    expect(dialog.state.policy.initialFocus).toBe('first-tabbable');
    expect(dialog.state.trapFocus).toBe(true);
    expect(dialog.state.scrollLock).toBe(false);
    expect(dialog.parts.content.getProps().aria?.labelledby).toBe(dialog.state.ids.titleId);

    const closed = dialog.actions.onEscapeKeyDown();
    expect(closed).toBe(true);
    expect(dialog.state.open).toBe(false);
    expect(dialog.state.lastChangeReason).toBe('close-escape');
  });

  it('closes on outside interaction when policy allows', () => {
    const dialog = createDialogController({
      defaultOpen: true,
      outsideInteractionBehavior: 'close',
      returnFocusId: 'trigger',
    });

    const closed = dialog.actions.onOutsideInteraction();
    expect(closed).toBe(true);
    expect(dialog.state.open).toBe(false);
    expect(dialog.state.lastChangeReason).toBe('close-pointer-outside');
  });

  it('keeps controlled open state stable until syncOpen is applied', () => {
    const onOpenChange = vi.fn();
    const dialog = createDialogController({
      open: false,
      onOpenChange,
      returnFocusId: 'dialog-trigger',
    });

    dialog.actions.open('open-trigger');
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(dialog.state.open).toBe(false);

    dialog.actions.syncOpen(true);
    expect(dialog.state.open).toBe(true);
  });

  it('synchronizes mutable overlay inputs after mount', () => {
    const dialog = createDialogController({ defaultOpen: false });

    dialog.update({
      modal: false,
      trapFocus: false,
      scrollLock: false,
      closeOnEscape: false,
      closeOnInteractOutside: false,
      closeOnOutsideInteraction: false,
      outsideInteractionBehavior: 'ignore',
      placement: 'top-start',
      forceMount: true,
      initialFocusId: 'updated-initial',
      returnFocusId: 'updated-return',
      accessibleName: 'Updated dialog',
    });

    expect(dialog.state).toMatchObject({
      modal: false,
      trapFocus: false,
      scrollLock: false,
      closeOnEscape: false,
      closeOnInteractOutside: false,
      placement: 'top-start',
      forceMount: true,
      initialFocusId: 'updated-initial',
      returnFocusId: 'updated-return',
      accessibleName: 'Updated dialog',
    });
    expect(dialog.parts.content.getProps()).toMatchObject({
      hidden: false,
      aria: { label: 'Updated dialog' },
    });
  });

  it('keeps fixed bases isolated to their explicit model scopes', () => {
    const first = createDialogController({ idBase: 'shared-dialog' });
    const second = createDialogController({ idBase: 'shared-dialog' });
    expect(first.state.ids).toEqual(second.state.ids);
  });
});
