import { mergeContext, type UifnStoryDecorator } from './types';

export function createLocaleDecorator(locale = 'en-US'): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    globals: {
      locale,
      dir: locale.startsWith('ar') || locale.startsWith('he') ? 'rtl' : 'ltr',
    },
  }));
}
