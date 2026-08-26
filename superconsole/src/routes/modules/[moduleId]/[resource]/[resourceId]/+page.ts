import { loadResourceDetail } from '$lib/components/resource-pages';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params, parent, depends, url }) => {
  depends(`superconsole:module:${params.moduleId}:resource:${params.resource}:${params.resourceId}`);
  const { shell } = await parent();
  return loadResourceDetail({
    fetcher: fetch,
    url,
    registry: shell.registry,
    moduleId: params.moduleId,
    resourceId: params.resource,
    identity: params.resourceId,
  });
};
