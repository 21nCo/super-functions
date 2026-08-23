import * as React from 'react';
import {
  getMediaQuerySnapshot,
  subscribeMediaQuery,
  type MediaQueryOptions,
} from '@uifn/dom';

export type UseMediaQueryOptions = MediaQueryOptions;

export function useMediaQuery(query: string, options: UseMediaQueryOptions = {}): boolean {
  const [matches, setMatches] = React.useState(() => getMediaQuerySnapshot(query, options));

  React.useEffect(() => {
    const subscription = subscribeMediaQuery(query, setMatches, options);
    setMatches(subscription.value);

    return () => subscription.unsubscribe();
  }, [query, options.defaultValue, options.environment]);

  return matches;
}
