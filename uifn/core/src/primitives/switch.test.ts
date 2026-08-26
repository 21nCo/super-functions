import { describe, expect, it, vi } from 'vitest';
import { createSwitchRuntime } from './switch';

describe('switch primitive', () => {
  it('toggles checked state and serializes form values', () => {
    const machine = createSwitchRuntime({
      name: 'alerts',
      defaultChecked: false,
      value: 'on',
    });

    machine.actions.toggle();
    expect(machine.state.checked).toBe(true);
    expect(machine.state.ariaChecked).toBe('true');
    expect(machine.state.pressed).toBe(true);
    expect(machine.actions.getFormValue()).toEqual({ alerts: 'on' });
  });

  it('ignores disabled interactions', () => {
    const machine = createSwitchRuntime({
      disabled: true,
      defaultChecked: false,
    });

    machine.actions.toggle();
    expect(machine.state.checked).toBe(false);
    expect(machine.state.lastError?.code).toBe('UIFN_ERR_DISABLED_INTERACTION');
  });

  it('keeps controlled checked state stable until syncChecked is applied', () => {
    const onCheckedChange = vi.fn();
    const machine = createSwitchRuntime({
      checked: false,
      name: 'alerts',
      onCheckedChange,
    });

    machine.actions.toggle();
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(machine.state.checked).toBe(false);
    expect(machine.actions.getFormValue()).toEqual({});

    machine.actions.syncChecked(true);
    expect(machine.state.checked).toBe(true);
    expect(machine.state.ariaChecked).toBe('true');
    expect(machine.state.pressed).toBe(true);
  });
});
