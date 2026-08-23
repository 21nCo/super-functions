import { describe, expect, it } from 'vitest';
import { createManualRuntimeScheduler } from '../internal/runtime/scheduler';
import { createToastController } from './toast';

describe('toast primitive', () => {
  it('pauses absolute-deadline timers and promotes its bounded queue', () => {
    const scheduler = createManualRuntimeScheduler();
    const toast = createToastController({ limit: 1, duration: 100, toasts: [{ id: 'a' }, { id: 'b' }] }, { scheduler, now: scheduler.now });
    expect(toast.state.visible.map((item) => item.id)).toEqual(['a']);
    toast.actions.pause('hover');
    scheduler.advanceBy(300);
    expect(toast.state.visible.map((item) => item.id)).toEqual(['a']);
    toast.actions.resume('hover');
    scheduler.advanceBy(100);
    expect(toast.state.visible.map((item) => item.id)).toEqual(['b']);
    toast.destroy();
    expect(scheduler.pending().timeout).toBe(0);

    const route = createToastController({ limit: 1, duration: 100, toasts: [{ id: 'visible' }, { id: 'queued' }] }, { scheduler, now: scheduler.now });
    route.actions.routeChange();
    expect(route.state.visible).toEqual([]);
    expect(route.state.queued).toEqual([]);
    route.destroy();
  });
});
