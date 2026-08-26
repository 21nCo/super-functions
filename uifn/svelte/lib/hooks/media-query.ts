import { readable } from 'svelte/store';
import {
  getMediaQuerySnapshot,
  subscribeMediaQuery,
  type MediaQueryOptions,
} from '@uifn/dom';

export type UseMediaQueryOptions = MediaQueryOptions;

export function createMediaQuery(query: string, options: UseMediaQueryOptions = {}) {
  return readable(getMediaQuerySnapshot(query, options), (set) => {
    const subscription = subscribeMediaQuery(query, set, options);
    set(subscription.value);
    return () => subscription.unsubscribe();
  });
}

export const useMediaQuery = createMediaQuery;
