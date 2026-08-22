import type { AdminOperationContext, AdminOperationDefinition } from "./types.js";

function isImplicitSecretKey(key: string): boolean {
  const normalized = key.replace(/[-_\s]/g, "").toLowerCase();
  if (
    /(?:password|passwd|secret|token|authorization|cookie|credential|privatekey|apikey)/.test(
      normalized,
    )
  ) {
    return true;
  }
  return [
    "code",
    "otp",
    "otpcode",
    "recoverycode",
    "recoverycodes",
    "session",
    "sessionid",
    "verificationcode",
  ].includes(normalized);
}

export interface AdminAuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorType?: string;
  scope: AdminOperationContext["scope"];
  moduleId: string;
  operationId: string;
  classification: AdminOperationDefinition["safety"]["classification"];
  permission: string;
  source: string;
  requestId: string;
  correlationId?: string;
  idempotencyKey?: string;
  target:
    | { resource: string; collection: true }
    | { resource: string; idInput: string; id?: string | number };
  input: unknown;
  outcome: "attempted" | "succeeded" | "failed" | "denied" | "replayed";
  errorCode?: string;
  durationMs: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AdminAuditSink {
  /**
   * Runtime capability marker. `write` must be durable and first-write-wins by
   * `event.id`: retrying the same ID must not append another logical event,
   * including after an acknowledgement is lost.
   */
  readonly idempotentById: true;
  write(event: AdminAuditEvent): Promise<void> | void;
}

/**
 * An audit sink may use this error only when it can prove the event was not
 * durably persisted. Ordinary write errors are acknowledgement-ambiguous and
 * must not be used as evidence that a domain mutation is safe to compensate.
 */
export class AdminAuditNotPersistedError extends Error {
  readonly definitelyNotPersisted = true;

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AdminAuditNotPersistedError";
  }
}

export function auditFailureDefinitelyNotPersisted(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (
      current instanceof AdminAuditNotPersistedError ||
      (current as { definitelyNotPersisted?: unknown }).definitelyNotPersisted === true
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type AdminAuditIdFactory = () => string;

export function createAdminAuditId(): string {
  return `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function redactAdminValue(
  value: unknown,
  sensitiveFields: readonly string[] = [],
  seen = new WeakSet<object>(),
): unknown {
  return redactValue(value, sensitiveFields, true, [], seen);
}

export function redactAdminOutputValue(
  value: unknown,
  sensitiveFields: readonly string[] = [],
  allowOutputPaths: readonly string[] = [],
  seen = new WeakSet<object>(),
): unknown {
  return redactValue(value, sensitiveFields, true, allowOutputPaths, seen);
}

export function redactDeclaredAdminValue(
  value: unknown,
  sensitiveFields: readonly string[] = [],
  seen = new WeakSet<object>(),
): unknown {
  return redactValue(value, sensitiveFields, false, [], seen);
}

function redactValue(
  value: unknown,
  sensitiveFields: readonly string[],
  redactImplicitSecrets: boolean,
  allowedPaths: readonly string[],
  seen: WeakSet<object>,
): unknown {
  const normalizeKey = (field: string) =>
    field.replace(/[-_\s]/g, "").toLowerCase();
  const explicit = new Set(sensitiveFields.map(normalizeKey));
  const allowed = new Set(allowedPaths);
  const visit = (current: unknown, path: string): unknown => {
    if (!current || typeof current !== "object") return current;
    if (seen.has(current)) return "[Circular]";
    seen.add(current);
    const redacted = Array.isArray(current)
      ? current.map((item, index) => visit(item, `${path}[${index}]`))
      : Object.fromEntries(Object.entries(current as Record<string, unknown>).map(([key, item]) => {
          const itemPath = `${path}.${key}`;
          const wildcardPath = itemPath.replace(/\[\d+\]/g, "[*]");
          const explicitlyAllowed = allowed.has(itemPath) || allowed.has(wildcardPath);
          return [
            key,
            explicit.has(normalizeKey(key)) || ((redactImplicitSecrets && isImplicitSecretKey(key)) && !explicitlyAllowed)
              ? "[REDACTED]"
              : visit(item, itemPath),
          ];
        }));
    seen.delete(current);
    return redacted;
  };
  return visit(value, "$" );
}

export class MemoryAdminAuditSink implements AdminAuditSink {
  readonly idempotentById = true as const;
  readonly events: AdminAuditEvent[] = [];
  write(event: AdminAuditEvent): void {
    if (this.events.some((existing) => existing.id === event.id)) return;
    this.events.push(structuredClone(event));
  }
}
