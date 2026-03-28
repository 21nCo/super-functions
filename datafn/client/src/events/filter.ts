/**
 * Event filtering logic
 */

import type { DatafnEvent } from "@datafn/core";

export interface EventFilter {
  type?: string | string[];
  resource?: string | string[];
  ids?: string | string[];
  mutationId?: string | string[];
  action?: string | string[]; // CLIENT-FILTER-001
  fields?: string | string[]; // CLIENT-FILTER-001
  contextKeys?: string[]; // CLIENT-FILTER-001
  context?: Record<string, unknown>; // EVT-002: shallow equality matching
}

/**
 * Normalize a filter to a canonical form for deterministic comparison
 */
export function normalizeFilter(filter: EventFilter): EventFilter {
  const normalized: EventFilter = {};

  // Normalize arrays and sort them
  if (filter.type !== undefined) {
    normalized.type = Array.isArray(filter.type)
      ? [...filter.type].sort()
      : filter.type;
  }
  if (filter.resource !== undefined) {
    normalized.resource = Array.isArray(filter.resource)
      ? [...filter.resource].sort()
      : filter.resource;
  }
  if (filter.ids !== undefined) {
    normalized.ids = Array.isArray(filter.ids)
      ? [...filter.ids].sort()
      : filter.ids;
  }
  if (filter.mutationId !== undefined) {
    normalized.mutationId = Array.isArray(filter.mutationId)
      ? [...filter.mutationId].sort()
      : filter.mutationId;
  }
  if (filter.action !== undefined) {
    normalized.action = Array.isArray(filter.action)
      ? [...filter.action].sort()
      : filter.action;
  }
  if (filter.fields !== undefined) {
    normalized.fields = Array.isArray(filter.fields)
      ? [...filter.fields].sort()
      : filter.fields;
  }
  if (filter.contextKeys !== undefined) {
    normalized.contextKeys = [...filter.contextKeys].sort();
  }
  if (filter.context !== undefined) {
    // Sort context keys for deterministic serialization
    normalized.context = filter.context;
  }

  return normalized;
}

/**
 * Check if an event matches the filter
 */
export function matchesFilter(
  event: DatafnEvent,
  filter?: EventFilter,
): boolean {
  if (!filter) return true;

  // Match type
  if (filter.type !== undefined) {
    if (Array.isArray(filter.type)) {
      if (!filter.type.includes(event.type)) return false;
    } else {
      if (event.type !== filter.type) return false;
    }
  }

  // Match resource
  if (filter.resource !== undefined && event.resource) {
    if (Array.isArray(filter.resource)) {
      if (!filter.resource.includes(event.resource)) return false;
    } else {
      if (event.resource !== filter.resource) return false;
    }
  }

  // Match ids (any of the event ids must match)
  if (filter.ids !== undefined && event.ids) {
    const filterIds = Array.isArray(filter.ids) ? filter.ids : [filter.ids];
    const eventIds = Array.isArray(event.ids) ? event.ids : [event.ids];
    const hasMatch = eventIds.some((id) => filterIds.includes(id));
    if (!hasMatch) return false;
  }

  // Match mutationId
  if (filter.mutationId !== undefined && event.mutationId) {
    if (Array.isArray(filter.mutationId)) {
      if (!filter.mutationId.includes(event.mutationId)) return false;
    } else {
      if (event.mutationId !== filter.mutationId) return false;
    }
  }

  // Match action (CLIENT-FILTER-001)
  if (filter.action !== undefined && event.action) {
    if (Array.isArray(filter.action)) {
      if (!filter.action.includes(event.action)) return false;
    } else {
      if (event.action !== filter.action) return false;
    }
  }

  // Match fields - non-empty intersection (CLIENT-FILTER-001)
  if (filter.fields !== undefined && event.fields) {
    const filterFields = Array.isArray(filter.fields)
      ? filter.fields
      : [filter.fields];
    const eventFields = Array.isArray(event.fields)
      ? event.fields
      : [event.fields];

    // Check for non-empty intersection
    const hasIntersection = filterFields.some((f) => eventFields.includes(f));
    if (!hasIntersection) return false;
  }

  // Match contextKeys - all must exist (CLIENT-FILTER-001)
  if (filter.contextKeys !== undefined && filter.contextKeys.length > 0) {
    if (!event.context || typeof event.context !== "object") {
      return false;
    }

    const ctx = event.context as Record<string, unknown>;
    const allExist = filter.contextKeys.every((key) => key in ctx);
    if (!allExist) return false;
  }

  // Match context - shallow equality (EVT-002)
  if (filter.context !== undefined) {
    if (!event.context || typeof event.context !== "object") {
      return false;
    }

    const ctx = event.context as Record<string, unknown>;
    // Check that all key/value pairs in filter.context match event.context
    for (const [key, value] of Object.entries(filter.context)) {
      if (ctx[key] !== value) {
        return false;
      }
    }
  }

  return true;
}
