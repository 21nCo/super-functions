export {
  mountSvelteContent,
  type SvelteContentMountHandle,
  type SvelteContentMountOptions,
} from './content.js';
export {
  mountSveltePage,
  type SveltePageMountOptions,
} from './page.js';

export interface ExtfnSvelteAdapter {
  framework: 'svelte';
  supportsHmr: true;
}

export function extfnSvelte(): ExtfnSvelteAdapter {
  return {
    framework: 'svelte',
    supportsHmr: true,
  };
}
