import { mergeContext, type UifnStoryDecorator } from './types';

export type UifnViewport = 'mobile' | 'tablet' | 'desktop' | 'wide';

export function createViewportDecorator(viewport: UifnViewport = 'desktop'): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    globals: {
      viewport,
    },
    parameters: {
      viewport: {
        defaultViewport: viewport,
      },
    },
  }));
}
