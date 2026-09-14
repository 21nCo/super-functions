import type { Adapter, WhereClause } from "@superfunctions/db";
import { generateId, nowIso } from "@secfn/core/id";
import type { SecurityAuditEvent, SecurityMetrics, SecFnLogger } from "@secfn/core";
import type { AuditWriteInput } from "./types.js";

export interface AuditServiceOptions {
  db: Adapter;
  logger?: SecFnLogger;
  sink?: (event: SecurityAuditEvent) => void | Promise<void>;
}

export class AuditService {
  constructor(private readonly options: AuditServiceOptions) {}

  async write(input: AuditWriteInput): Promise<SecurityAuditEvent> {
    const event: SecurityAuditEvent = {
      id: generateId("event"),
      timestamp: nowIso(),
      type: input.type,
      severity: input.severity,
      tenantId: input.tenantId,
      namespaceId: input.namespaceId,
      namespace: input.namespace,
      environmentId: input.environmentId,
      environment: input.environment,
      actorId: input.actorId,
      ip: input.ip,
      userAgent: input.userAgent,
      resource: input.resource,
      action: input.action,
      requestId: input.requestId,
      metadata: input.metadata ?? {},
      resolved: false,
    };

    await this.options.db.create({
      model: "secfn_audit_events",
      data: event as unknown as Record<string, unknown>,
    });

    // The durable event has committed. Secondary delivery cannot fail the mutation.
    try {
      const summary = sanitizeForLog(event);
      if (event.severity === "critical" || event.severity === "high") {
        this.options.logger?.warn("secfn security event", summary);
      } else { this.options.logger?.info("secfn security event", summary); }
    } catch { /* A host logger must not change committed operation semantics. */ }
    try { await this.options.sink?.(event); }
    catch {
      try { this.options.logger?.warn("secfn audit sink delivery failed", { eventId: event.id }); } catch { /* Durable event remains available. */ }
    }
    return event;
  }

  async queryEvents(query: {
    type?: string;
    severity?: string;
    tenantId?: string;
    namespace?: string;
    actorId?: string;
    resolved?: boolean;
    limit?: number;
  } = {}): Promise<SecurityAuditEvent[]> {
    const where: WhereClause[] = [];
    if (query.type) where.push({ field: "type", operator: "eq", value: query.type });
    if (query.severity) where.push({ field: "severity", operator: "eq", value: query.severity });
    if (query.tenantId) where.push({ field: "tenantId", operator: "eq", value: query.tenantId });
    if (query.namespace) where.push({ field: "namespace", operator: "eq", value: query.namespace });
    if (query.actorId) where.push({ field: "actorId", operator: "eq", value: query.actorId });
    if (query.resolved !== undefined) where.push({ field: "resolved", operator: "eq", value: query.resolved });
    return this.options.db.findMany<SecurityAuditEvent>({
      model: "secfn_audit_events",
      where,
      orderBy: [{ field: "timestamp", direction: "desc" }],
      limit: query.limit ?? 100,
    });
  }

  async logEvent(input: AuditWriteInput): Promise<string> {
    return (await this.write(input)).id;
  }

  async getRecentEvents(limit = 100): Promise<SecurityAuditEvent[]> {
    return this.queryEvents({ limit });
  }

  async getCriticalEvents(limit = 100): Promise<SecurityAuditEvent[]> {
    return this.queryEvents({ severity: "critical", limit });
  }

  async getUnresolvedEvents(limit = 100): Promise<SecurityAuditEvent[]> {
    return this.queryEvents({ resolved: false, limit });
  }

  async resolveEvent(id: string, input: { resolvedBy: string; notes?: string }): Promise<void> {
    await this.options.db.update({
      model: "secfn_audit_events",
      where: [{ field: "id", operator: "eq", value: id }],
      data: {
        resolved: true,
        resolvedAt: nowIso(),
        resolvedBy: input.resolvedBy,
        notes: input.notes,
      },
    });
  }

  async getMetrics(): Promise<SecurityMetrics> {
    const cutoff = nowIso();
    let totalEvents = 0;
    let afterId: string | undefined;
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const actors = new Map<string, number>();
    const ips = new Map<string, number>();

    while (true) {
      const events = await this.options.db.findMany<SecurityAuditEvent>({
        model: "secfn_audit_events",
        where: [{ field: "timestamp", operator: "lt", value: cutoff }, ...(afterId ? [{ field: "id", operator: "gt" as const, value: afterId }] : [])],
        orderBy: [{ field: "id", direction: "asc" }],
        limit: 1000,
      });
      if (!events.length) break;
      totalEvents += events.length;
      for (const event of events) {
        eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
        eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] ?? 0) + 1;
        if (event.actorId) actors.set(event.actorId, (actors.get(event.actorId) ?? 0) + 1);
        if (event.ip) ips.set(event.ip, (ips.get(event.ip) ?? 0) + 1);
      }
      afterId = events.at(-1)!.id;
    }

    return {
      totalEvents,
      eventsByType,
      eventsBySeverity,
      topActors: sortedCounts(actors, "actorId"),
      topIps: sortedCounts(ips, "ip"),
    };
  }
}

export function createSecurityLoggerSink(logger: SecFnLogger) {
  return (event: SecurityAuditEvent): void => {
    logger.info("secfn audit event", sanitizeForLog(event));
  };
}

function sanitizeForLog(event: SecurityAuditEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    severity: event.severity,
    tenantId: event.tenantId,
    namespace: event.namespace,
    namespaceId: event.namespaceId,
    environment: event.environment,
    environmentId: event.environmentId,
    actorId: event.actorId,
    ip: event.ip,
    resource: event.resource,
    action: event.action,
    requestId: event.requestId,
    resolved: event.resolved,
  };
}

function sortedCounts<K extends "actorId" | "ip">(
  counts: Map<string, number>,
  key: K,
): Array<Record<K, string> & { count: number }> {
  return Array.from(counts.entries())
    .map(([value, count]) => ({ [key]: value, count }) as Record<K, string> & { count: number })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
