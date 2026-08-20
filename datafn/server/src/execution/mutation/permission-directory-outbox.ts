import { randomUUID } from "crypto";
import type { Adapter } from "@superfunctions/db";

import type { DatafnLogger } from "../../logger.js";
import type { DatafnMultiRegionRuntimeConfig } from "../../plugins/multi-region.js";
import { ensureInternalTable } from "../internal-tables.js";
import {
  syncDatafnPermissionGrantAfterCommit,
  type DatafnPermissionGrantSnapshot,
} from "./share.js";

const OUTBOX_TABLE = "__datafn_permission_directory_outbox";
const PRECOMMIT_TASK_LEASE_MS = 5 * 60 * 1000;
const PRECOMMIT_TASK_RENEWAL_MS = Math.floor(PRECOMMIT_TASK_LEASE_MS / 3);
const DRAIN_CLAIM_LEASE_MS = 60 * 1000;
interface PrecommitLeaseHeartbeat {
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  leaseValue: string;
}

const precommitLeaseHeartbeats = new Map<string, PrecommitLeaseHeartbeat>();

function nextPrecommitLeaseExpiry(): string {
  return new Date(Date.now() + PRECOMMIT_TASK_LEASE_MS).toISOString();
}

function stopPrecommitLeaseHeartbeat(taskId: string): string | undefined {
  const heartbeat = precommitLeaseHeartbeats.get(taskId);
  if (!heartbeat) return undefined;
  heartbeat.stopped = true;
  if (heartbeat.timer) clearTimeout(heartbeat.timer);
  precommitLeaseHeartbeats.delete(taskId);
  return heartbeat.leaseValue;
}

function startPrecommitLeaseHeartbeat(
  db: Adapter,
  taskId: string,
  initialLeaseValue: string,
): void {
  stopPrecommitLeaseHeartbeat(taskId);
  const heartbeat: PrecommitLeaseHeartbeat = {
    stopped: false,
    timer: null,
    leaseValue: initialLeaseValue,
  };
  const schedule = () => {
    if (heartbeat.stopped) return;
    heartbeat.timer = setTimeout(() => {
      heartbeat.timer = null;
      void renew();
    }, PRECOMMIT_TASK_RENEWAL_MS);
    heartbeat.timer.unref?.();
  };
  const renew = async () => {
    const expectedLeaseValue = heartbeat.leaseValue;
    const renewedLeaseValue = nextPrecommitLeaseExpiry();
    try {
      const updated = await db.internal.update(OUTBOX_TABLE, [
        { field: "id", op: "eq", value: taskId },
        { field: "next_attempt_at", op: "eq", value: expectedLeaseValue },
      ], {
        next_attempt_at: renewedLeaseValue,
      });
      if (updated > 0 && !heartbeat.stopped) {
        heartbeat.leaseValue = renewedLeaseValue;
      }
    } catch {
      // Keep trying while the owner is alive. If it crashes or cannot renew,
      // the last persisted lease expires and another drainer can recover it.
    } finally {
      // Schedule only after the current write settles. Overlapping writes can
      // otherwise complete out of order and shorten a newer owner lease.
      schedule();
    }
  };
  precommitLeaseHeartbeats.set(taskId, heartbeat);
  schedule();
}

export interface PermissionDirectorySyncMutation {
  operation: string;
  resource: string;
  id?: string;
  scope?: "record" | "resource";
  shareWith?: { principalId?: string; userId?: string };
  compensationSnapshot?: DatafnPermissionGrantSnapshot;
}

export async function ensurePermissionDirectoryOutbox(db: Adapter): Promise<void> {
  await ensureInternalTable(db, OUTBOX_TABLE);
}

export async function enqueuePermissionDirectorySync(
  db: Adapter,
  mutation: PermissionDirectorySyncMutation,
  namespace: string,
  regionId: string,
  options: { pending?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const nextAttemptAt = options.pending
    ? nextPrecommitLeaseExpiry()
    : now;
  await db.internal.create(OUTBOX_TABLE, {
    id,
    namespace,
    region_id: regionId,
    mutation: JSON.stringify(mutation),
    attempts: 0,
    last_error: "",
    next_attempt_at: nextAttemptAt,
    created_at: now,
  });
  if (options.pending) {
    // A renewable owner lease keeps background drainers away for operations
    // of any duration. Process death stops renewal, making the durable task
    // recoverable once the last lease expires.
    startPrecommitLeaseHeartbeat(db, id, nextAttemptAt);
  }
  return id;
}

export async function markPermissionDirectorySyncReady(
  db: Adapter,
  taskId: string,
): Promise<void> {
  stopPrecommitLeaseHeartbeat(taskId);
  await db.internal.update(OUTBOX_TABLE, [
    { field: "id", op: "eq", value: taskId },
  ], {
    next_attempt_at: new Date().toISOString(),
  });
}

export async function deferFailedShareCompensation(
  db: Adapter,
  taskId: string,
  mutation: PermissionDirectorySyncMutation,
  snapshot: DatafnPermissionGrantSnapshot,
  error: unknown,
  namespace: string,
  regionId: string,
): Promise<void> {
  const expectedLeaseValue = stopPrecommitLeaseHeartbeat(taskId);
  const compensationMutation = {
    ...mutation,
    operation: "compensate-failed-share",
    compensationSnapshot: snapshot,
  } satisfies PermissionDirectorySyncMutation;
  const updated = expectedLeaseValue
    ? await db.internal.update(OUTBOX_TABLE, [
        { field: "id", op: "eq", value: taskId },
        { field: "next_attempt_at", op: "eq", value: expectedLeaseValue },
      ], {
        mutation: JSON.stringify(compensationMutation),
        last_error: String(error),
        next_attempt_at: new Date().toISOString(),
      })
    : 0;
  if (updated === 0) {
    // Ownership was already transferred to a drainer (or the original row was
    // deleted). A fresh ready task preserves the failed compensation instead
    // of mutating a task that another owner may concurrently settle.
    await enqueuePermissionDirectorySync(
      db,
      compensationMutation,
      namespace,
      regionId,
    );
  }
}

export async function drainPermissionDirectorySync(
  db: Adapter,
  taskId: string,
  runtime: DatafnMultiRegionRuntimeConfig,
  logger?: DatafnLogger,
  options: { expectedNextAttemptAt?: string } = {},
): Promise<boolean> {
  // Explicit settlement transfers ownership away from the local pre-commit
  // operation. Stop renewal before the first fallible read so every exit,
  // including lookup failure or a missing row, leaves the durable lease able
  // to expire into background recovery.
  if (!options.expectedNextAttemptAt) {
    stopPrecommitLeaseHeartbeat(taskId);
  }
  const taskWhere: Array<{
    field: string;
    op: "eq";
    value: unknown;
  }> = [
    { field: "id", op: "eq", value: taskId },
    ...(options.expectedNextAttemptAt
      ? [{
          field: "next_attempt_at",
          op: "eq" as const,
          value: options.expectedNextAttemptAt,
        }]
      : []),
  ];
  const task = await db.internal.findOne(OUTBOX_TABLE, taskWhere);
  if (!task) {
    if (!options.expectedNextAttemptAt) return true;
    return false;
  }
  if (String(task.region_id) !== runtime.regionId) return false;

  try {
    const mutation = JSON.parse(String(task.mutation)) as PermissionDirectorySyncMutation;
    await syncDatafnPermissionGrantAfterCommit(
      db,
      mutation,
      String(task.namespace),
      runtime,
    );
    const deleted = await db.internal.delete(OUTBOX_TABLE, taskWhere);
    if (deleted > 0) stopPrecommitLeaseHeartbeat(taskId);
    // A live owner may renew after a stale drainer claimed the row. The
    // conditional delete fences that race: reconciliation is idempotent, and
    // the still-durable task will be repaired again after owner settlement.
    return deleted > 0;
  } catch (error) {
    const attempts = Number(task.attempts ?? 0) + 1;
    const retryDelaySeconds = Math.min(15 * (2 ** Math.min(attempts - 1, 5)), 300);
    await db.internal.update(OUTBOX_TABLE, taskWhere, {
      attempts,
      last_error: String(error),
      next_attempt_at: new Date(Date.now() + retryDelaySeconds * 1000).toISOString(),
    });
    logger?.error("Permission directory reconciliation deferred for retry", {
      error: String(error),
      operation: "permission-directory-outbox",
      taskId,
    });
    return false;
  }
}

export async function drainPermissionDirectoryOutbox(
  db: Adapter,
  runtime: DatafnMultiRegionRuntimeConfig,
  logger?: DatafnLogger,
  limit = 100,
): Promise<{ processed: number; pending: number }> {
  await ensurePermissionDirectoryOutbox(db);
  const tasks = await db.internal.findMany(OUTBOX_TABLE, [
    { field: "region_id", op: "eq", value: runtime.regionId },
    { field: "next_attempt_at", op: "lte", value: new Date().toISOString() },
  ], {
    orderBy: "next_attempt_at",
    limit,
  });
  let processed = 0;
  for (const task of tasks) {
    const taskId = String(task.id);
    const selectedNextAttemptAt = String(task.next_attempt_at);
    const claimedNextAttemptAt = new Date(
      Date.now() + DRAIN_CLAIM_LEASE_MS,
    ).toISOString();
    const claimed = await db.internal.update(OUTBOX_TABLE, [
      { field: "id", op: "eq", value: taskId },
      { field: "region_id", op: "eq", value: runtime.regionId },
      { field: "next_attempt_at", op: "eq", value: selectedNextAttemptAt },
    ], {
      next_attempt_at: claimedNextAttemptAt,
    });
    if (claimed === 0) continue;
    if (await drainPermissionDirectorySync(
      db,
      taskId,
      runtime,
      logger,
      { expectedNextAttemptAt: claimedNextAttemptAt },
    )) {
      processed += 1;
    }
  }
  return { processed, pending: tasks.length - processed };
}
