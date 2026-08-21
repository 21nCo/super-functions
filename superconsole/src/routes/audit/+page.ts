import { ADMIN_API_PREFIX, fetchAdmin, withAdminScope } from '$lib/components/admin-api';
import type { AuditEventViewModel } from '$lib/components/view-models';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('superconsole:audit');
  const query = new URLSearchParams();
  for (const key of ['cursor', 'actor', 'module', 'outcome', 'q']) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const result = await fetchAdmin<{ events: AuditEventViewModel[]; total?: number; nextCursor?: string }>(
    fetch,
    withAdminScope(`${ADMIN_API_PREFIX}/audit${query.size ? `?${query}` : ''}`, url.searchParams)
  );
  return {
    events: result.ok ? result.data.events ?? [] : [],
    total: result.ok ? result.data.total : undefined,
    nextCursor: result.ok ? result.data.nextCursor : undefined,
    loadError: result.ok ? undefined : result.error,
    query: url.searchParams.get('q') ?? '',
  };
};
