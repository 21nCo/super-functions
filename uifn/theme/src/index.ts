export * from './provider';
export * from './mount';
export * from './brand';
export * from './preferences';
export * from './foundations';

export const themePackage = {
  name: '@uifn/theme',
  layer: 'styling',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;
