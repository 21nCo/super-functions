import { describe, expect, it, vi } from 'vitest';
import { createLifecycleScope } from '../lifecycle';
import { composeRefs, createElementRegistry } from '../refs';
import { createSSRGuard } from '../ssr';

describe('adapter low-level utilities', () => {
  it('composes callback and object refs', () => {
    const callbackRef = vi.fn();
    const objectRef: { current: string | null } = { current: null };
    const ref = composeRefs<string>(callbackRef, objectRef);

    ref('element');

    expect(callbackRef).toHaveBeenCalledWith('element');
    expect(objectRef.current).toBe('element');
  });

  it('registers and requires elements by stable key', () => {
    const registry = createElementRegistry<string>({ component: 'TestRegistry' });
    const unregister = registry.register('trigger', 'element');

    expect(registry.require('trigger')).toBe('element');
    expect(registry.snapshot()).toEqual({ trigger: 'element' });

    unregister();
    expect(registry.has('trigger')).toBe(false);
  });

  it('preserves newer registrations and accepts falsy registered values', () => {
    const registry = createElementRegistry<string>();
    const removeOld = registry.register('item', 'old');
    registry.register('item', 'new');
    removeOld();
    expect(registry.require('item')).toBe('new');
    registry.register('empty', '');
    expect(registry.require('empty')).toBe('');
  });

  it('runs lifecycle cleanup in reverse order once', () => {
    const scope = createLifecycleScope();
    const calls: string[] = [];

    scope.add(() => calls.push('first'));
    scope.add(() => calls.push('second'));
    scope.cleanup();
    scope.cleanup();

    expect(calls).toEqual(['second', 'first']);
    expect(scope.active()).toBe(false);
    expect(scope.size()).toBe(0);
  });

  it('supports destructured lifecycle methods and runs every cleanup after failures', () => {
    const scope = createLifecycleScope();
    const { run } = scope;
    const calls: string[] = [];
    run(() => () => calls.push('first'));
    scope.add(() => { calls.push('second'); throw new Error('second failed'); });
    scope.add(() => { calls.push('third'); throw new Error('third failed'); });
    expect(() => scope.cleanup()).toThrow(AggregateError);
    expect(calls).toEqual(['third', 'second', 'first']);
    expect(scope.size()).toBe(0);
  });

  it('guards client-only work during SSR', () => {
    const ssr = createSSRGuard({ canUseDOM: () => false });
    const client = createSSRGuard({ canUseDOM: () => true });

    expect(ssr.isBrowser()).toBe(false);
    expect(ssr.runClient('focus', () => 'client', 'fallback')).toBe('fallback');
    expect(client.runClient('client-bind', () => 'client', 'fallback')).toBe('client');
    const { runClient } = client;
    expect(runClient('destructured', () => 'client', 'fallback')).toBe('client');
    expect(() => ssr.assertClient('client-bind')).toThrowError();
  });
});
