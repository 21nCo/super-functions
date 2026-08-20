import { randomUUID } from "crypto";
import type { Adapter } from "@superfunctions/db";

import type { DatafnLogger } from "../../logger.js";
import type { DatafnMultiRegionRuntimeConfig } from "../../plugins/multi-region.js";
import { ensureInternalTable } from "../internal-tables.js";
import { syncDatafnPermissionGrantAfterCommit } from "./share.js";

const OUTBOX_TABLE = "__datafn_permission_directory_outbox";
const PRECOMMIT_TASK_LEASE_MS = 5 * 60 * 1000;

export interface PermissionDirectorySyncMutation {
  operation: string;
  resource: string;
  id?: string;
  scope?: "record" | "resource";
  shareWith?: { principalId?: string; userId?: string };
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
    ? new Date(Date.now() + PRECOMMIT_TASK_LEASE_MS).toISOString()
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
  return id;
}

export async function markPermissionDirectorySyncReady(
  db: Adapter,
  taskId: string,
): Promise<void> {
  await db.internal.update(OUTBOX_TABLE, [
    { field: "id", op: "eq", value: taskId },
  ], {
    next_attempt_at: new Date().toISOString(),
  });
}

export async function drainPermissionDirectorySync(
  db: Adapter,
  taskId: string,
  runtime: DatafnMultiRegionRuntimeConfig,
  logger?: DatafnLogger,
): Promise<boolean> {
  const task = await db.internal.findOne(OUTBOX_TABLE, [
    { field: "id", op: "eq", value: taskId },
  ]);
  if (!task) return true;
  if (String(task.region_id) !== runtime.regionId) return false;

  try {
    const mutation = JSON.parse(String(task.mutation)) as PermissionDirectorySyncMutation;
    await syncDatafnPermissionGrantAfterCommit(
      db,
      mutation,
      String(task.namespace),
      runtime,
    );
    await db.internal.delete(OUTBOX_TABLE, [
      { field: "id", op: "eq", value: taskId },
    ]);
    return true;
  } catch (error) {
    const attempts = Number(task.attempts ?? 0) + 1;
    const retryDelaySeconds = Math.min(15 * (2 ** Math.min(attempts - 1, 5)), 300);
    await db.internal.update(OUTBOX_TABLE, [
      { field: "id", op: "eq", value: taskId },
    ], {
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
    if (await drainPermissionDirectorySync(db, String(task.id), runtime, logger)) {
      processed += 1;
    }
  }
  return { processed, pending: tasks.length - processed };
}
