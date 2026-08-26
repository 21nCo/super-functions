import { ADMIN_API_PREFIX, fetchAdmin, withAdminScope } from '$lib/components/admin-api';
import type { AdminAuditEvent } from '@superfunctions/admin';
import type { AuditEventViewModel } from '$lib/components/view-models';
import type { PageLoad } from './$types';

function auditEventView(event: AdminAuditEvent): AuditEventViewModel {
  const outcome = event.outcome === 'attempted'
    ? 'pending'
    : event.outcome === 'succeeded' || event.outcome === 'replayed'
      ? 'success'
      : 'failure';
  const target = 'collection' in event.target
    ? event.target.resource
    : `${event.target.resource}:${event.target.id ?? event.target.idInput}`;
  return {
    id: event.id,
    actor: event.actorType ? `${event.actorType}:${event.actorId}` : event.actorId,
    action: event.operationId,
    target,
    occurredAt: event.timestamp,
    moduleId: event.moduleId,
    outcome,
    requestId: event.requestId,
    metadata: event.metadata ? { ...event.metadata } : undefined,
  };
}

export const load: PageLoad = async ({ fetch, url, depends }) => {
  depends('superconsole:audit');
  const query = new URLSearchParams();
  for (const key of ['cursor', 'actor', 'module', 'outcome', 'q']) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const result = await fetchAdmin<{ events: AdminAuditEvent[]; total?: number; nextCursor?: string }>(
    fetch,
    withAdminScope(`${ADMIN_API_PREFIX}/audit${query.size ? `?${query}` : ''}`, url.searchParams)
  );
  return {
    events: result.ok ? (result.data.events ?? []).map(auditEventView) : [],
    total: result.ok ? result.data.total : undefined,
    nextCursor: result.ok ? result.data.nextCursor : undefined,
    loadError: result.ok ? undefined : result.error,
    query: url.searchParams.get('q') ?? '',
  };
};
