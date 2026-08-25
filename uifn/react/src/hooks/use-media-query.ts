import * as React from 'react';
import {
  getMediaQuerySnapshot,
  subscribeMediaQuery,
  type MediaQueryOptions,
} from '@uifn/dom';

export type UseMediaQueryOptions = MediaQueryOptions;

export function useMediaQuery(query: string, options: UseMediaQueryOptions = {}): boolean {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const subscription = subscribeMediaQuery(query, onStoreChange, options);
    return subscription.unsubscribe;
  }, [query, options.defaultValue, options.environment]);
  const getSnapshot = React.useCallback(
    () => getMediaQuerySnapshot(query, options),
    [query, options.defaultValue, options.environment],
  );
  const getServerSnapshot = React.useCallback(
    () => options.defaultValue ?? false,
    [options.defaultValue],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
