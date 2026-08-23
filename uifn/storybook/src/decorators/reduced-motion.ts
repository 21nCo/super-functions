import { mergeContext, type UifnStoryDecorator } from './types';

export function createReducedMotionDecorator(enabled = true): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    globals: {
      reducedMotion: enabled,
    },
    parameters: {
      chromatic: {
        pauseAnimationAtEnd: enabled,
      },
    },
  }));
}
