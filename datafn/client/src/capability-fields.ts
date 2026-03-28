import { resolveCapabilities, type DatafnSchema } from "@datafn/core";

type CapabilityMutationOp = "insert" | "merge" | "replace";

type CapabilityContext = {
  hasTimestamps: boolean;
  hasAudit: boolean;
  hasTrash: boolean;
};

function resolveCapabilityContext(
  schema: DatafnSchema,
  resourceName: string,
): CapabilityContext | null {
  const resource = schema.resources.find((r) => r.name === resourceName);
  if (!resource) return null;

  const resolved = resolveCapabilities(
    schema.capabilities as any,
    resource.capabilities as any,
  );

  return {
    hasTimestamps: resolved.some((entry) => entry === "timestamps"),
    hasAudit: resolved.some((entry) => entry === "audit"),
    hasTrash: resolved.some((entry) => entry === "trash"),
  };
}

function stripReadonlyCapabilityFields(
  record: Record<string, unknown>,
  context: CapabilityContext,
): Record<string, unknown> {
  const next = { ...record };

  if (context.hasTimestamps) {
    delete next.createdAt;
    delete next.updatedAt;
  }
  if (context.hasAudit) {
    delete next.createdBy;
    delete next.updatedBy;
  }
  if (context.hasTrash) {
    delete next.trashedAt;
    delete next.trashedBy;
  }

  return next;
}

function isRecordOperation(operation: unknown): operation is CapabilityMutationOp {
  return operation === "insert" || operation === "merge" || operation === "replace";
}

export function sanitizeCapabilityReadonlyFields(
  schema: DatafnSchema | undefined,
  mutation: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema) return mutation;

  const operation = mutation.operation;
  if (!isRecordOperation(operation)) return mutation;

  if (typeof mutation.record !== "object" || mutation.record === null || Array.isArray(mutation.record)) {
    return mutation;
  }

  const resourceName = mutation.resource;
  if (typeof resourceName !== "string") return mutation;

  const context = resolveCapabilityContext(schema, resourceName);
  if (!context) return mutation;

  return {
    ...mutation,
    record: stripReadonlyCapabilityFields(
      mutation.record as Record<string, unknown>,
      context,
    ),
  };
}

export function injectCapabilityFieldsForOptimisticRecord(
  schema: DatafnSchema,
  mutation: Record<string, unknown>,
  opts: {
    timestampMs: number;
    actorId?: string;
    existingRecord?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const operation = mutation.operation;
  if (!isRecordOperation(operation)) {
    return (mutation.record || {}) as Record<string, unknown>;
  }

  const resourceName = mutation.resource;
  if (typeof resourceName !== "string") {
    return (mutation.record || {}) as Record<string, unknown>;
  }

  const context = resolveCapabilityContext(schema, resourceName);
  if (!context) {
    return (mutation.record || {}) as Record<string, unknown>;
  }

  const base = stripReadonlyCapabilityFields(
    ((mutation.record || {}) as Record<string, unknown>),
    context,
  );
  const next = { ...base };

  if (operation === "insert") {
    if (context.hasTimestamps) {
      next.createdAt = opts.timestampMs;
      next.updatedAt = opts.timestampMs;
    }
    if (context.hasAudit) {
      next.createdBy = opts.actorId ?? null;
      next.updatedBy = opts.actorId ?? null;
    }
    return next;
  }

  if (operation === "merge") {
    if (context.hasTimestamps) {
      next.updatedAt = opts.timestampMs;
    }
    if (context.hasAudit) {
      next.updatedBy = opts.actorId ?? null;
    }
    return next;
  }

  // replace
  const existing = opts.existingRecord || null;
  if (context.hasTimestamps) {
    if (existing && existing.createdAt !== undefined) {
      next.createdAt = existing.createdAt;
    }
    next.updatedAt = opts.timestampMs;
  }
  if (context.hasAudit) {
    if (existing && existing.createdBy !== undefined) {
      next.createdBy = existing.createdBy;
    }
    next.updatedBy = opts.actorId ?? null;
  }
  return next;
}
