import { describe, expect, it, vi } from 'vitest';

import { systemClock } from './runtime.js';

describe('MailFn runtime clock', () => {
  it('removes abort listeners after completed sleeps', async () => {
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    await systemClock.sleep(0, controller.signal);
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
