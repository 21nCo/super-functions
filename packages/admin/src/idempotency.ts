import { AdminError } from "./errors.js";
import { stableSerialize } from "./validator.js";
import type { AdminResult, AdminScope } from "./types.js";

export interface AdminIdempotencyIdentity {
  key: string;
  actorId: string;
  scope: AdminScope;
  operationId: string;
}

export interface AdminIdempotencyRecord<T = unknown> {
  identity: AdminIdempotencyIdentity;
  fingerprint: string;
  result: AdminResult<T>;
  auditId?: string;
  /** Domain completion is durable before the terminal audit is attempted. */
  audit?: {
    status: "pending" | "completed" | "not-required";
    /** Stable logical terminal event ID, persisted before the first sink write. */
    auditId?: string;
    updatedAt: string;
  };
  createdAt: string;
}

export interface AdminIdempotencyClaim {
  identity: AdminIdempotencyIdentity;
  fingerprint: string;
  token: string;
}

export type AdminIdempotencyBeginResult<T = unknown> =
  | { status: "acquired"; claim: AdminIdempotencyClaim }
  | { status: "replay"; record: AdminIdempotencyRecord<T> }
  | {
      status: "in-progress";
      /** In-process stores may provide completion notification. Distributed stores normally return retryAfterMs. */
      wait?: Promise<AdminIdempotencyRecord<T> | undefined>;
      retryAfterMs?: number;
    };

/**
 * Atomic reservation contract. Durable implementations must make `begin` a
 * compare-and-create operation on the full identity and must fence `complete`
 * and `release` with the claim token. `release` is used only before domain
 * invocation, so a failed audit/policy dependency cannot poison a safe retry.
 * Cross-process stores should use a renewable lease or a documented stale-claim
 * recovery policy. `complete` must be safely repeatable with the same claim,
 * identity, fingerprint and result: the dispatcher retries it after ambiguous
 * dependency acknowledgement failures and never re-invokes the domain.
 */
export interface AdminIdempotencyStore {
  begin<T = unknown>(input: {
    identity: AdminIdempotencyIdentity;
    fingerprint: string;
  }): Promise<AdminIdempotencyBeginResult<T>> | AdminIdempotencyBeginResult<T>;
  complete<T = unknown>(
    claim: AdminIdempotencyClaim,
    record: AdminIdempotencyRecord<T>,
  ): Promise<void> | void;
  /**
   * Mandatory atomic reconciliation hook. Implementations may transition only
   * a matching pending terminal-audit marker to completed, and must be
   * idempotent for the same audit ID. This prevents every replay from emitting
   * another terminal event after the domain result was already durable.
   */
  finalizeAudit(
    identity: AdminIdempotencyIdentity,
    fingerprint: string,
    input: { auditId: string; completedAt: string },
  ): Promise<void> | void;
  release(claim: AdminIdempotencyClaim): Promise<void> | void;
}

export function adminIdempotencyStorageKey(identity: AdminIdempotencyIdentity): string {
  return stableSerialize(identity);
}

export async function adminInputFingerprint(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableSerialize(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

interface MemoryPendingEntry {
  status: "in-progress";
  fingerprint: string;
  token: string;
  wait: Promise<AdminIdempotencyRecord | undefined>;
  resolve: (record: AdminIdempotencyRecord | undefined) => void;
}

interface MemoryCompletedEntry {
  status: "completed";
  fingerprint: string;
  token: string;
  record: AdminIdempotencyRecord;
}

/** Process-local atomic test/development store. It is not durable or multi-process safe. */
export class MemoryAdminIdempotencyStore implements AdminIdempotencyStore {
  private readonly entries = new Map<string, MemoryPendingEntry | MemoryCompletedEntry>();

  begin<T = unknown>(input: {
    identity: AdminIdempotencyIdentity;
    fingerprint: string;
  }): AdminIdempotencyBeginResult<T> {
    const key = adminIdempotencyStorageKey(input.identity);
    const existing = this.entries.get(key);
    if (existing && existing.fingerprint !== input.fingerprint) {
      throw new AdminError("conflict", "The idempotency key was already used with different input.");
    }
    if (existing?.status === "completed") {
      return { status: "replay", record: structuredClone(existing.record) as AdminIdempotencyRecord<T> };
    }
    if (existing?.status === "in-progress") {
      return { status: "in-progress", wait: existing.wait as Promise<AdminIdempotencyRecord<T> | undefined> };
    }

    let resolve!: (record: AdminIdempotencyRecord | undefined) => void;
    const wait = new Promise<AdminIdempotencyRecord | undefined>((complete) => { resolve = complete; });
    const token = `claim_${crypto.randomUUID()}`;
    this.entries.set(key, { status: "in-progress", fingerprint: input.fingerprint, token, wait, resolve });
    return { status: "acquired", claim: { identity: input.identity, fingerprint: input.fingerprint, token } };
  }

  complete<T = unknown>(claim: AdminIdempotencyClaim, record: AdminIdempotencyRecord<T>): void {
    const key = adminIdempotencyStorageKey(claim.identity);
    const existing = this.entries.get(key);
    if (existing?.status === "completed" && existing.token === claim.token) {
      if (existing.fingerprint !== claim.fingerprint || record.fingerprint !== claim.fingerprint) {
        throw new AdminError("conflict", "The idempotency completion fingerprint does not match its reservation.");
      }
      existing.record = structuredClone(record) as AdminIdempotencyRecord;
      return;
    }
    if (!existing || existing.status !== "in-progress" || existing.token !== claim.token) {
      throw new AdminError("conflict", "The idempotency reservation is no longer owned by this operation.");
    }
    if (existing.fingerprint !== claim.fingerprint || record.fingerprint !== claim.fingerprint) {
      throw new AdminError("conflict", "The idempotency completion fingerprint does not match its reservation.");
    }
    const snapshot = structuredClone(record) as AdminIdempotencyRecord;
    this.entries.set(key, { status: "completed", fingerprint: claim.fingerprint, token: claim.token, record: snapshot });
    existing.resolve(structuredClone(snapshot));
  }

  finalizeAudit(
    identity: AdminIdempotencyIdentity,
    fingerprint: string,
    input: { auditId: string; completedAt: string },
  ): void {
    const existing = this.entries.get(adminIdempotencyStorageKey(identity));
    if (!existing || existing.status !== "completed" || existing.fingerprint !== fingerprint) {
      throw new AdminError("conflict", "The idempotency record is unavailable for audit reconciliation.");
    }
    if (existing.record.audit?.status === "completed") {
      if (existing.record.audit.auditId === input.auditId) return;
      throw new AdminError("conflict", "The terminal audit was already reconciled with a different audit ID.");
    }
    if (existing.record.audit?.status !== "pending") {
      throw new AdminError("conflict", "The idempotency record has no pending terminal audit to reconcile.");
    }
    existing.record = {
      ...existing.record,
      auditId: input.auditId,
      result: { ...existing.record.result, auditId: input.auditId },
      audit: { status: "completed", auditId: input.auditId, updatedAt: input.completedAt },
    };
  }

  release(claim: AdminIdempotencyClaim): void {
    const key = adminIdempotencyStorageKey(claim.identity);
    const existing = this.entries.get(key);
    if (!existing || existing.status !== "in-progress" || existing.token !== claim.token) {
      throw new AdminError("conflict", "The idempotency reservation is no longer owned by this operation.");
    }
    if (existing.fingerprint !== claim.fingerprint) {
      throw new AdminError("conflict", "The idempotency release fingerprint does not match its reservation.");
    }
    this.entries.delete(key);
    existing.resolve(undefined);
  }
}

export async function beginAdminIdempotency<T>(
  store: AdminIdempotencyStore,
  identity: AdminIdempotencyIdentity,
  input: unknown,
): Promise<
  | { status: "acquired"; claim: AdminIdempotencyClaim }
  | { status: "replay"; record: AdminIdempotencyRecord<T> }
> {
  const fingerprint = await adminInputFingerprint(input);
  // A released in-process claim may resolve without a record; retry its atomic begin once observed.
  for (;;) {
    const reservation = await store.begin<T>({ identity, fingerprint });
    if (reservation.status === "acquired" || reservation.status === "replay") return reservation;
    if (!reservation.wait) {
      throw new AdminError("conflict", "An operation with this idempotency key is already in progress.", {
        details: { retryAfterMs: reservation.retryAfterMs },
        retryable: true,
      });
    }
    const record = await reservation.wait;
    if (record) return { status: "replay", record };
  }
}
