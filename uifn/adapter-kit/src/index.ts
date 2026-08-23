export * from './merge-props';
export * from './refs';
export * from './lifecycle';
export * from './ssr';
export * from './conformance';

export const adapterKitPackage = {
  name: '@uifn/adapter-kit',
  layer: 'adapter-kit',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;
