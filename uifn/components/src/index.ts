export const componentsPackage = {
  name: '@uifn/components',
  layer: 'components-neutral',
  status: 'ga-candidate',
  styling: 'public-visual-defaults',
  behaviorOwner: '@uifn/core',
  sourcePolicy: 'clean-room',
} as const;

export * from './generated/catalog';
export * from './contracts';
export * from './pilots';
