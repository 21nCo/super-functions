import { describe, expect, it } from 'vitest';
import { UIFnError } from '../errors';
import { mergePartProps } from '../parts';
import { createCheckboxController, createDialogController } from '../primitives';

describe('PHASE_02 primitive vectors', () => {
  it('TV-CORE-001: Dialog controller returns deterministic part props', () => {
    const controller = createDialogController(
      {
        defaultOpen: false,
        modal: true,
      },
      {
        generateId: () => 'fixed',
      }
    );

    controller.parts.trigger.getProps().on?.click?.({ type: 'click' });

    expect(controller.state.open).toBe(true);
    expect(controller.state.modal).toBe(true);
    expect(controller.parts.trigger.getProps()).toMatchObject({
      aria: {
        haspopup: 'dialog',
        expanded: true,
        controls: 'dialog-content-fixed',
      },
      data: {
        state: 'open',
      },
    });
    expect(controller.parts.content.getProps()).toMatchObject({
      role: 'dialog',
      id: 'dialog-content-fixed',
      aria: {
        modal: true,
      },
      data: {
        state: 'open',
      },
    });
  });

  it('TV-CORE-001 negative: duplicate controller ids fail explicitly', () => {
    expect(() =>
      createDialogController(
        {
          defaultOpen: false,
          modal: true,
        },
        {
          generateId: () => 'fixed',
          issuedIds: ['dialog-content-fixed'],
        }
      )
    ).toThrowError(UIFnError);

    try {
      createDialogController(
        {
          defaultOpen: false,
          modal: true,
        },
        {
          generateId: () => 'fixed',
          issuedIds: ['dialog-content-fixed'],
        }
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UIFnError);
      expect((error as UIFnError).code).toBe('UIFN_CORE_ENVIRONMENT_INVALID');
    }
  });

  it('TV-CORE-002: disabled Checkbox ignores state-changing input', () => {
    const controller = createCheckboxController(
      {
        defaultChecked: false,
        disabled: true,
      },
      {
        generateId: () => 'fixed',
      }
    );

    controller.parts.root.getProps().on?.click?.({ type: 'click' });

    expect(controller.state.checked).toBe(false);
    expect(controller.state.disabled).toBe(true);
    expect(controller.state.lastError?.code).toBe('UIFN_ERR_DISABLED_INTERACTION');
    expect(controller.state.lastError?.recoverable).toBe(true);
  });

  it('TV-CORE-003: required accessibility props cannot be removed by user props', () => {
    const merged = mergePartProps(
      {
        role: 'tab',
        aria: {
          selected: true,
        },
      },
      {
        role: 'button',
        aria: {
          selected: null,
        },
      },
      {
        component: 'Tabs',
        part: 'trigger',
        required: {
          role: true,
          aria: ['selected'],
        },
      }
    );

    expect(merged).toMatchObject({
      role: 'tab',
      aria: {
        selected: true,
      },
      warnings: ['UIFN_PART_INVARIANT_OVERRIDDEN'],
    });
  });

  it('TV-CORE-003 negative: missing required role throws explicit error', () => {
    try {
      mergePartProps(
        {},
        {},
        {
          component: 'Tabs',
          part: 'trigger',
          required: {
            role: true,
          },
        }
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UIFnError);
      expect((error as UIFnError).code).toBe('UIFN_REQUIRED_A11Y_PROP_MISSING');
      return;
    }

    throw new Error('Expected UIFN_REQUIRED_A11Y_PROP_MISSING');
  });
});
