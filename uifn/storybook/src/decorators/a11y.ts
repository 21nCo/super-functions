import { mergeContext, type UifnStoryDecorator } from './types';

export function createA11yDecorator(): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    parameters: {
      a11y: {
        test: 'error',
        options: {
          checks: { 'color-contrast': { enabled: true } },
        },
      },
    },
  }));
}
