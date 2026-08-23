export * from './surface';
export * from './button';
export * from './component';
export * from './generated/component-recipes';

export const recipesPackage = {
  name: '@uifn/recipes',
  layer: 'styling',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;
