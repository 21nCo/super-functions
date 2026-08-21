import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import {
  beginMutationFeedback,
  clearMutationFeedback,
  mutationFeedback,
  publishMutationFeedback,
  refreshSuccessfulMutation,
} from '../../src/lib/components/mutation-outcome';

describe('completed administration mutations', () => {
  it('keeps a completed mutation successful when its follow-up refresh fails', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('navigation unavailable'));

    await expect(refreshSuccessfulMutation('Policy updated. Audit audit-1.', refresh)).resolves.toEqual({
      ok: true,
      message: 'Policy updated. Audit audit-1. The view could not refresh; reload to see the latest state.',
      refreshed: false,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('reports a successful refresh without changing the operation receipt', async () => {
    await expect(refreshSuccessfulMutation('Run cancelled. Request req-1.', async () => undefined)).resolves.toEqual({
      ok: true,
      message: 'Run cancelled. Request req-1.',
      refreshed: true,
    });
  });

  it('keeps the authoritative receipt in the shell when an action component is replaced', () => {
    publishMutationFeedback({ ok: true, message: 'Run cancelled. Request req-1.', refreshed: true });
    expect(get(mutationFeedback)).toEqual({
      ok: true,
      message: 'Run cancelled. Request req-1.',
      refreshed: true,
    });
    publishMutationFeedback(undefined);
  });

  it('does not let an older concurrent mutation overwrite the latest receipt', () => {
    clearMutationFeedback();
    const older = beginMutationFeedback();
    const latest = beginMutationFeedback();

    publishMutationFeedback({ ok: true, message: 'Older receipt', refreshed: true }, older);
    expect(get(mutationFeedback)).toBeUndefined();
    publishMutationFeedback({ ok: true, message: 'Latest receipt', refreshed: true }, latest);
    expect(get(mutationFeedback)?.message).toBe('Latest receipt');
  });
});
