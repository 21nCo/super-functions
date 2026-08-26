import { ADMIN_API_PREFIX, fetchAdmin, safeConsoleNavigationHref, withAdminScope } from '$lib/components/admin-api';
import type { PageLoad } from './$types';

interface SearchResultViewModel {
  id: string;
  title: string;
  description?: string;
  moduleId: string;
  resource?: string;
  href: string;
  status?: string;
  updatedAt?: string;
}

export const load: PageLoad = async ({ fetch, url, depends }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  depends(`superconsole:search:${query}`);
  if (!query) return { query, results: [], total: 0 };
  const cursor = url.searchParams.get('cursor');
  const requestQuery = new URLSearchParams({ q: query });
  if (cursor) requestQuery.set('cursor', cursor);
  const result = await fetchAdmin<{ results: SearchResultViewModel[]; total?: number; nextCursor?: string }>(
    fetch,
    withAdminScope(`${ADMIN_API_PREFIX}/search?${requestQuery}`, url.searchParams)
  );
  return {
    query,
    results: result.ok ? (result.data.results ?? []).flatMap((item) => {
      const href = safeConsoleNavigationHref(item.href, url.origin);
      return href ? [{ ...item, href }] : [];
    }) : [],
    total: result.ok ? result.data.total ?? result.data.results?.length ?? 0 : 0,
    nextCursor: result.ok ? result.data.nextCursor : undefined,
    loadError: result.ok ? undefined : result.error,
  };
};
