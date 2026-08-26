import { loadResourceList } from '$lib/components/resource-pages';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent, url, depends }) => {
  depends(`superconsole:module:${params.moduleId}:resource:${params.resource}`);
  const { shell } = await parent();
  return loadResourceList({
    fetcher: fetch,
    url,
    registry: shell.registry,
    moduleId: params.moduleId,
    resourceId: params.resource,
  });
};
