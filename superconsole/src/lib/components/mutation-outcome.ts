import { writable } from 'svelte/store';

export interface SuccessfulMutationFeedback {
  ok: true;
  message: string;
  refreshed: boolean;
}

/**
 * Shell-owned receipt channel. Resource/action components can be replaced by a
 * successful invalidation (for example Cancel becomes Retry); the authoritative
 * receipt must survive that component replacement.
 */
export const mutationFeedback = writable<SuccessfulMutationFeedback | undefined>(undefined);
let mutationGeneration = 0;

export function beginMutationFeedback(): number {
  mutationGeneration += 1;
  mutationFeedback.set(undefined);
  return mutationGeneration;
}

export function publishMutationFeedback(
  feedback: SuccessfulMutationFeedback | undefined,
  generation?: number
): void {
  if (generation !== undefined && generation !== mutationGeneration) return;
  if (generation === undefined) mutationGeneration += 1;
  mutationFeedback.set(feedback);
}

export function clearMutationFeedback(): void {
  mutationGeneration += 1;
  mutationFeedback.set(undefined);
}

/**
 * Refreshing a view is a follow-up to a completed administration mutation.
 * A refresh failure must never rewrite the authoritative operation outcome or
 * invite a duplicate retry with a new idempotency key.
 */
export async function refreshSuccessfulMutation(
  message: string,
  refresh: () => Promise<unknown>
): Promise<SuccessfulMutationFeedback> {
  try {
    await refresh();
    return { ok: true, message, refreshed: true };
  } catch {
    return {
      ok: true,
      message: `${message} The view could not refresh; reload to see the latest state.`,
      refreshed: false,
    };
  }
}
