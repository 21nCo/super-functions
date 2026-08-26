export const storybookPackage = {
  name: '@uifn/storybook',
  layer: 'storybook',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;

export * from './decorators';
export * from './generate-docs';
export * from './panel';
export * from './preset';
export * from './validate-stories';
