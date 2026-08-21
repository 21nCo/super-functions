import { loadShellViewModel } from '$lib/components/admin-api';
import type { LayoutLoad } from './$types';

export const prerender = false;
export const ssr = true;

export const load: LayoutLoad = async ({ fetch, depends, url }) => {
  depends('superconsole:registry', 'superconsole:overview');
  return {
    shell: await loadShellViewModel(fetch, url.searchParams),
  };
};
