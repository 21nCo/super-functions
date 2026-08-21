import { describe, expect, it, vi } from 'vitest';
import * as core from './index';
import {
  UIFnError,
  assertContext,
  assertInRange,
  assertValidValue,
  createUIFnError,
  runIfEnabled,
  toUIFnErrorPayload,
} from './errors';

describe('UIFnError utilities', () => {
  it('creates typed errors with canonical metadata', () => {
    const error = createUIFnError({
      code: 'UIFN_ERR_CONTEXT_MISSING',
      package: '@uifn/core',
      component: 'DialogTrigger',
      details: { provider: 'Dialog' },
    });

    expect(error).toBeInstanceOf(UIFnError);
    expect(error.name).toBe('UIFnError');
    expect(error.code).toBe('UIFN_ERR_CONTEXT_MISSING');
    expect(error.package).toBe('@uifn/core');
    expect(error.component).toBe('DialogTrigger');
    expect(error.recoverable).toBe(false);
    expect(error.toJSON()).toEqual({
      name: 'UIFnError',
      code: 'UIFN_ERR_CONTEXT_MISSING',
      package: '@uifn/core',
      component: 'DialogTrigger',
      message: 'Required UI context is missing.',
      recoverable: false,
      details: { provider: 'Dialog' },
    });
  });

  it('throws UIFnError for missing context assertions', () => {
    expect(() =>
      assertContext(undefined, {
        package: '@uifn/core',
        component: 'DialogTrigger',
      })
    ).toThrowError(UIFnError);
  });

  it('throws stable invalid-value and range errors', () => {
    expect(() =>
      assertValidValue(false, {
        package: '@uifn/core',
        component: 'Select',
        details: { value: 'missing' },
      })
    ).toThrowError(UIFnError);

    expect(() =>
      assertInRange(12, { min: 0, max: 10 }, { package: '@uifn/core', component: 'Slider' })
    ).toThrowError(UIFnError);
  });

  it('serializes unknown failures into canonical payloads', () => {
    const payload = toUIFnErrorPayload(new Error('broken adapter'), {
      package: '@uifn/react',
      component: 'DialogTrigger',
    });

    expect(payload).toEqual({
      name: 'UIFnError',
      code: 'UIFN_ERR_TOOLCHAIN_MISCONFIG',
      package: '@uifn/react',
      component: 'DialogTrigger',
      message: 'broken adapter',
      recoverable: false,
      details: { originalErrorName: 'Error' },
    });
  });

  it('exports canonical error helpers through the root core barrel', () => {
    expect(typeof core.createUIFnError).toBe('function');
    expect(typeof core.assertContext).toBe('function');
    expect(typeof core.assertValidValue).toBe('function');
    expect(typeof core.assertInRange).toBe('function');
    expect(typeof core.toUIFnErrorPayload).toBe('function');
  });

  it('no-ops disabled interactions without throwing', () => {
    const fn = vi.fn();
    expect(() => runIfEnabled(false, fn)).not.toThrow();
    expect(fn).not.toHaveBeenCalled();

    expect(runIfEnabled(true, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
