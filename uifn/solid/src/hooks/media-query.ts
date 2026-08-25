import { createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import {
  subscribeMediaQuery,
  type MediaQueryOptions,
} from '@uifn/dom';

export type UseMediaQueryOptions = MediaQueryOptions;

export function createMediaQuery(query: string, options: UseMediaQueryOptions = {}): Accessor<boolean> {
  const [matches, setMatches] = createSignal(options.defaultValue ?? false);
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
