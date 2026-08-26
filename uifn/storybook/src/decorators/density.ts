import { mergeContext, type UifnStoryDecorator } from './types';

export type UifnDensity = 'compact' | 'comfortable' | 'spacious';

export function createDensityDecorator(density: UifnDensity = 'comfortable'): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    globals: {
      uifnDensity: density,
    },
  }));
}
