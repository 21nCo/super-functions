import { describe, expect, it, vi } from 'vitest';
import type { UIFnDomScope } from './scope';

const floatingMocks = vi.hoisted(() => ({
  autoUpdate: vi.fn(() => vi.fn()),
  computePosition: vi.fn(async () => ({
    x: 1,
    y: 2,
    placement: 'bottom',
    strategy: 'absolute',
    middlewareData: {},
  })),
}));

vi.mock('@floating-ui/dom', () => ({
  arrow: vi.fn(() => ({ name: 'arrow' })),
  autoUpdate: floatingMocks.autoUpdate,
  computePosition: floatingMocks.computePosition,
  flip: vi.fn(() => ({ name: 'flip' })),
  hide: vi.fn(() => ({ name: 'hide' })),
  inline: vi.fn(() => ({ name: 'inline' })),
  offset: vi.fn(() => ({ name: 'offset' })),
  shift: vi.fn(() => ({ name: 'shift' })),
  size: vi.fn(() => ({ name: 'size' })),
}));

import { createUIFnPositioner } from './positioning';

describe('createUIFnPositioner auto-update binding', () => {
  it('moves the subscription when the reference changes while running', async () => {
    floatingMocks.autoUpdate.mockClear();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    floatingMocks.autoUpdate
      .mockReturnValueOnce(firstCleanup)
      .mockReturnValueOnce(secondCleanup);
    const rect = () => ({ width: 10, height: 10 } as DOMRect);
    const first = { nodeType: 1, getBoundingClientRect: rect } as Element;
    const second = { nodeType: 1, getBoundingClientRect: rect } as Element;
    const floating = { getBoundingClientRect: rect } as HTMLElement;
    const scope = {
      assertAlive: vi.fn(),
      track: (_kind: string, cleanup = () => undefined) => {
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          cleanup();
        };
      },
      document: { documentElement: { clientWidth: 0, clientHeight: 0 } },
      environment: { now: () => 0, trace: vi.fn(), error: vi.fn() },
    } as unknown as UIFnDomScope;
    const positioner = createUIFnPositioner(scope, {
      reference: first,
      floating,
      applyStyles: false,
    });

    positioner.start();
    await positioner.update({ reference: second });

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(floatingMocks.autoUpdate).toHaveBeenCalledTimes(2);
    positioner.destroy();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });

  it('does not recursively rebind a fresh virtual-anchor resolver', async () => {
    floatingMocks.autoUpdate.mockReset();
    floatingMocks.computePosition.mockClear();
    const cleanup = vi.fn();
    floatingMocks.autoUpdate.mockReturnValue(cleanup);
    const rect = () => ({ x: 1, y: 2, width: 0, height: 0 } as DOMRect);
    const floating = { getBoundingClientRect: rect } as HTMLElement;
    const scope = {
      assertAlive: vi.fn(),
      track: (_kind: string, release = () => undefined) => release,
      document: { documentElement: { clientWidth: 0, clientHeight: 0 } },
      environment: { now: () => 0, trace: vi.fn(), error: vi.fn() },
    } as unknown as UIFnDomScope;
    const positioner = createUIFnPositioner(scope, {
      reference: () => ({ getBoundingClientRect: rect }),
      floating,
      applyStyles: false,
    });

    positioner.start();
    const automaticUpdate = (floatingMocks.autoUpdate.mock.calls as unknown[][])[0]?.[2] as (() => void) | undefined;
    automaticUpdate?.();
    await Promise.resolve();
    automaticUpdate?.();
    await Promise.resolve();

    expect(positioner.running).toBe(true);
    expect(floatingMocks.autoUpdate).toHaveBeenCalledOnce();
    positioner.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('rebinds an animation-frame subscription when the reference identity changes', async () => {
    floatingMocks.autoUpdate.mockReset();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    floatingMocks.autoUpdate
      .mockReturnValueOnce(firstCleanup)
      .mockReturnValueOnce(secondCleanup);
    const rect = () => ({ x: 1, y: 2, width: 10, height: 10 } as DOMRect);
    const element = { nodeType: 1, getBoundingClientRect: rect } as Element;
    const virtual = { contextElement: element, getBoundingClientRect: rect };
    let reference: Element | typeof virtual = element;
    const floating = { getBoundingClientRect: rect } as HTMLElement;
    const scope = {
      assertAlive: vi.fn(),
      track: (_kind: string, release = () => undefined) => release,
      document: { documentElement: { clientWidth: 0, clientHeight: 0 } },
      environment: { now: () => 0, trace: vi.fn(), error: vi.fn() },
    } as unknown as UIFnDomScope;
    const positioner = createUIFnPositioner(scope, {
      reference: () => reference,
      floating,
      animationFrame: true,
      applyStyles: false,
    });

    positioner.start();
    reference = virtual;
    await positioner.update();

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(floatingMocks.autoUpdate).toHaveBeenLastCalledWith(
      virtual,
      floating,
      expect.any(Function),
      { animationFrame: true },
    );
    positioner.destroy();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });
});
