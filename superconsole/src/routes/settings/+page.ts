import { ADMIN_API_PREFIX, fetchAdmin, withAdminScope } from '$lib/components/admin-api';
import type { PageLoad } from './$types';

interface SettingsViewModel {
  deploymentMode?: string;
  configurationSource?: string;
  tenantHierarchy?: string[];
  policies?: Array<{ id: string; label: string; description?: string; enabled: boolean; mutable?: boolean; apiHref?: string }>;
  retention?: Array<{ label: string; value: string }>;
}

export const load: PageLoad = async ({ fetch, depends, url }) => {
  depends('superconsole:settings');
  const result = await fetchAdmin<SettingsViewModel>(
    fetch,
    withAdminScope(`${ADMIN_API_PREFIX}/settings`, url.searchParams)
  );
  return { settings: result.ok ? result.data : undefined, loadError: result.ok ? undefined : result.error };
};
