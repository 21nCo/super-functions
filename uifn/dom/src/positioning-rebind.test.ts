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
    const first = { getBoundingClientRect: rect } as Element;
    const second = { getBoundingClientRect: rect } as Element;
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
    expect(floatingMocks.autoUpdate).toHaveBeenNthCalledWith(1, first, floating, expect.any(Function), { animationFrame: false });
    expect(floatingMocks.autoUpdate).toHaveBeenNthCalledWith(2, second, floating, expect.any(Function), { animationFrame: false });
    positioner.destroy();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });
});
