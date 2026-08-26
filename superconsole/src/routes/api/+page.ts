import { ADMIN_API_PREFIX, fetchAdmin, withAdminScope } from '$lib/components/admin-api';
import type { PageLoad } from './$types';

interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  tags?: Array<{ name: string; description?: string }>;
  paths?: Record<string, Record<string, { summary?: string; operationId?: string; tags?: string[] }>>;
}

export const load: PageLoad = async ({ fetch, depends, url }) => {
  depends('superconsole:openapi');
  const result = await fetchAdmin<OpenApiDocument>(
    fetch,
    withAdminScope(`${ADMIN_API_PREFIX}/openapi.json`, url.searchParams)
  );
  const spec = result.ok ? result.data : undefined;
  const operations = Object.entries(spec?.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, { summary?: string; operationId?: string; tags?: string[] }>)
      .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase()))
      .map(([method, operation]) => ({ path, method: method.toUpperCase(), ...operation }))
  );
  return { spec, operations, loadError: result.ok ? undefined : result.error };
};
