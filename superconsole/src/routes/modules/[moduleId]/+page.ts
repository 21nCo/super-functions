import { ADMIN_API_PREFIX, fetchAdmin, withAdminScope } from '$lib/components/admin-api';
import { moduleById, type AdminModuleViewModel } from '$lib/components/view-models';
import type { PageLoad } from './$types';

interface ModuleOverviewResponse {
  module?: AdminModuleViewModel;
  summary?: Array<{ id: string; label: string; value: string | number; detail?: string }>;
  notices?: Array<{ id: string; title: string; message: string; tone?: 'info' | 'warning' | 'danger' }>;
}

export const load: PageLoad = async ({ fetch, params, parent, depends, url }) => {
  depends(`superconsole:module:${params.moduleId}`);
  const { shell } = await parent();
  const registered = moduleById(shell.registry, params.moduleId);
  if (!registered) {
    return {
      module: undefined,
      summary: [],
      notices: [],
      loadError: {
        status: 404,
        code: 'MODULE_NOT_ENABLED',
        message: `${params.moduleId} is not enabled in this Super Console deployment.`,
      },
    };
  }

  const result = await fetchAdmin<ModuleOverviewResponse>(
    fetch,
    withAdminScope(
      `${ADMIN_API_PREFIX}/modules/${encodeURIComponent(registered.id)}`,
      url.searchParams
    )
  );
  const payload = result.ok ? result.data : {};
  return {
    module: payload.module ? { ...registered, ...payload.module } : registered,
    summary: payload.summary ?? [],
    notices: payload.notices ?? [],
    loadError: result.ok ? undefined : result.error,
  };
};
