import { ADMIN_API_PREFIX, fetchAdmin, withAdminScope } from '$lib/components/admin-api';
import type { PageLoad } from './$types';

interface McpViewModel {
  enabled: boolean;
  serverName?: string;
  transport?: string;
  endpoint?: string;
  tools?: Array<{ name: string; description?: string; moduleId?: string; mutation?: boolean; permission?: string }>;
  clients?: Array<{ id: string; name: string; lastSeenAt?: string; status?: string }>;
}

export const load: PageLoad = async ({ fetch, depends, url }) => {
  depends('superconsole:mcp');
  const result = await fetchAdmin<McpViewModel>(
    fetch,
    withAdminScope(`${ADMIN_API_PREFIX}/mcp`, url.searchParams)
  );
  return {
    mcp: result.ok ? result.data : undefined,
    loadError: result.ok ? undefined : result.error,
  };
};
