import { describe, expect, it } from 'vitest';
import { createAlertDialogController } from './alert-dialog';

describe('alert-dialog primitive', () => {
  it('disallows outside click and records documented error', () => {
    const alertDialog = createAlertDialogController({
      defaultOpen: true,
      returnFocusId: 'alert-trigger',
    });

    const handled = alertDialog.actions.onOutsideInteraction();
    expect(handled).toBe(false);
    expect(alertDialog.state.open).toBe(true);
    expect(alertDialog.state.lastError?.code).toBe('UIFN_ALERT_DIALOG_DISMISSAL');
    expect(alertDialog.state.policy.preventOutsideInteraction).toBe(true);
  });

  it('supports escape dismissal and focus return', () => {
    const alertDialog = createAlertDialogController({
      defaultOpen: true,
      returnFocusId: 'alert-trigger',
    });

    expect(alertDialog.state.scrollLock).toBe(true);
    expect(alertDialog.state.leastDestructiveFocusId).toBe(alertDialog.state.ids.cancelId);
    alertDialog.actions.onEscapeKeyDown();
    expect(alertDialog.state.open).toBe(false);
    expect(alertDialog.state.lastChangeReason).toBe('close-escape');
  });
});
