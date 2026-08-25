import { createSignal, onCleanup, onMount, sharedConfig, type Accessor } from 'solid-js';
import { isServer } from 'solid-js/web';
import {
  getMediaQuerySnapshot,
  subscribeMediaQuery,
  type MediaQueryOptions,
} from '@uifn/dom';

export type UseMediaQueryOptions = MediaQueryOptions;

export function createMediaQuery(query: string, options: UseMediaQueryOptions = {}): Accessor<boolean> {
  const hydrating = !isServer && sharedConfig.context !== undefined;
  const initialValue = isServer || hydrating
    ? options.defaultValue ?? false
    : getMediaQuerySnapshot(query, options);
  const [matches, setMatches] = createSignal(initialValue);
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    const subscription = subscribeMediaQuery(query, setMatches, options);
    setMatches(subscription.value);
    unsubscribe = subscription.unsubscribe;
  });

  onCleanup(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  return matches;
}

export const useMediaQuery = createMediaQuery;
