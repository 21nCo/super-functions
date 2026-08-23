export const sfPackage = {
  name: '@uifn/sf',
  layer: 'sf',
  status: 'beta',
  sourcePolicy: 'clean-room',
} as const;

export * from './shared';
export * from './authfn';
export * from './plugfn';
export * from './filefn';
export * from './billfn';
export * from './mocks';
