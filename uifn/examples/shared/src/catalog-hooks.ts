export const catalogHooks = [
  {
    slug: 'use-media-query',
    displayName: 'useMediaQuery',
    description: 'Observe a CSS media query through the framework-native uifn adapter.',
  },
  {
    slug: 'use-copy-to-clipboard',
    displayName: 'useCopyToClipboard',
    description: 'Copy text through the framework-native uifn adapter and inspect its result state.',
  },
] as const;

export type CatalogHookSlug = (typeof catalogHooks)[number]['slug'];

export function getCatalogHookBySlug(slug: string) {
  return catalogHooks.find((hook) => hook.slug === slug);
}
