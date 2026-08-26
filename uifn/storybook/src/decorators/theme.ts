import { mergeContext, type UifnStoryDecorator } from './types';

export interface ThemeDecoratorOptions {
  theme?: 'uifn-light' | 'uifn-dark' | 'uifn-high-contrast-light' | 'uifn-high-contrast-dark';
}

export function createThemeDecorator(options: ThemeDecoratorOptions = {}): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    globals: {
      uifnTheme: options.theme ?? 'uifn-light',
    },
    parameters: {
      backgrounds: {
        default: options.theme?.includes('dark') ? 'dark' : 'light',
      },
    },
  }));
}
