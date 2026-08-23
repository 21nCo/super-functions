import { describe, expect, it, vi } from 'vitest';
import { createUIFnFocusScopeManager } from './focus-scope';
import type { UIFnDomScope } from './scope';

function scopeFixture(): UIFnDomScope {
  return {
    assertAlive: vi.fn(),
    getActiveElement: () => null,
    on: () => () => undefined,
    track: () => () => undefined,
    setTimeout: () => () => undefined,
    environment: {
      now: () => 0,
      trace: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as UIFnDomScope;
}

describe('createUIFnFocusScopeManager', () => {
  it('keeps the prior scope active while a newer registration is disabled', () => {
    const manager = createUIFnFocusScopeManager(scopeFixture());
    const parent = manager.register({
      id: 'parent',
      container: {} as HTMLElement,
      deferInitialFocus: true,
    });
    const child = manager.register({
      id: 'child',
      container: {} as HTMLElement,
      enabled: false,
      deferInitialFocus: true,
    });

    expect(manager.activeScopeId).toBe('parent');
    expect(parent.active).toBe(true);
    expect(parent.paused).toBe(false);
    expect(child.active).toBe(false);

    child.update({ enabled: true });
    expect(manager.activeScopeId).toBe('child');
    expect(parent.paused).toBe(true);

    child.update({ enabled: false });
    expect(manager.activeScopeId).toBe('parent');
    expect(parent.paused).toBe(false);
    manager.destroy();
  });

  it('derives nesting from the newest enabled scope across three levels', () => {
    const manager = createUIFnFocusScopeManager(scopeFixture());
    const parent = manager.register({ id: 'parent', container: {} as HTMLElement, deferInitialFocus: true });
    const middle = manager.register({ id: 'middle', container: {} as HTMLElement, deferInitialFocus: true });
    const child = manager.register({ id: 'child', container: {} as HTMLElement, deferInitialFocus: true, returnFocus: false });

    expect(manager.activeScopeId).toBe('child');
    middle.update({ enabled: false });
    middle.update({ enabled: true });
    expect(manager.activeScopeId).toBe('child');

    child.update({ enabled: false });
    expect(manager.activeScopeId).toBe('middle');
    expect(parent.paused).toBe(true);
    expect(middle.paused).toBe(false);
    manager.destroy();
  });

  it('keeps an explicit pause after a nested scope is destroyed', () => {
    const manager = createUIFnFocusScopeManager(scopeFixture());
    const parent = manager.register({ id: 'parent', container: {} as HTMLElement, deferInitialFocus: true });
    parent.pause();
    const child = manager.register({ id: 'child', container: {} as HTMLElement, deferInitialFocus: true, returnFocus: false });

    child.destroy();
    expect(parent.paused).toBe(true);
    expect(manager.activeScopeId).toBeNull();
    parent.resume();
    expect(manager.activeScopeId).toBe('parent');
    manager.destroy();
  });
});
