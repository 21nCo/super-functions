import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";
import { defineSchema } from "@datafn/core";
import { get, writable } from "svelte/store";
import {
  fetchDemoContext,
  DEMO_SERVER_ORIGIN,
  resetDemoBaseline,
  readErrorCode,
  type DemoResetResult,
  type DemoUserId,
  type DemoWorkspaceId,
  type DemoContextResult,
} from "./api";
import {
  demoSession,
  getDemoIdentity,
  initializeDemoSession,
  type DemoSession,
} from "./demoSession";
import { DemoRemoteAdapter } from "./demoRemoteAdapter";

const schema = defineSchema({
  resources: [
    {
      name: "documents",
      version: 1,
      idPrefix: "doc:",
      capabilities: [
        "timestamps",
        "audit",
        {
          shareable: {
            levels: ["viewer", "editor", "owner"],
            default: "private",
            visibilityDefault: "private",
            supportsScopeGrants: true,
            crossNsShareable: true,
          },
        },
      ],
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "title", type: "string", required: true, minLength: 1, maxLength: 200 },
        {
          name: "content",
          type: "string",
          required: true,
          minLength: 1,
          maxLength: 20_000,
        },
      ],
      indices: {
        base: ["title"],
        search: ["title", "content"],
      },
    },
  ],
});

export type DocumentRecord = {
  id: string;
  title: string;
  content: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type ActivityItem = {
  timestamp: number;
  level: "info" | "error";
  message: string;
  code?: string;
};

export type PermissionGrant = {
  principalId: string;
  level: string;
  grantKind?: string;
  sourceRef?: string | null;
  resourceId?: string | null;
  grantedBy?: string;
  grantedAt?: number;
};

export type SyncStatus = {
  running: boolean;
  pullInProgress: boolean;
  resetInProgress: boolean;
  lastPullAt?: number;
  lastPullOutcome?: "success" | "error";
  lastEvent?: string;
  lastErrorCode?: string;
};

export const serverContext = writable<DemoContextResult | null>(null);
export const activityLog = writable<ActivityItem[]>([]);
export const switchingSession = writable(false);
export const clientNamespace = writable<string | undefined>(undefined);
export const syncStatus = writable<SyncStatus>({
  running: false,
  pullInProgress: false,
  resetInProgress: false,
});

const MAX_ACTIVITY_ITEMS = 40;
let initialized = false;
let switchChain: Promise<void> = Promise.resolve();

function pushActivity(item: ActivityItem) {
  activityLog.update((items) => [item, ...items].slice(0, MAX_ACTIVITY_ITEMS));
}

function patchSyncStatus(patch: Partial<SyncStatus>) {
  syncStatus.update((current) => ({ ...current, ...patch }));
}

async function reconcileNow(reason: string) {
  await client.sync.reconcileNow();
  patchSyncStatus({
    running: true,
    lastEvent: "reconcile_succeeded",
    lastErrorCode: undefined,
  });
  pushActivity({
    timestamp: Date.now(),
    level: "info",
    message: `Reconcile completed (${reason})`,
  });
}

function assertMutationSuccess(result: unknown) {
  if (
    typeof result === "object" &&
    result !== null &&
    "ok" in result &&
    (result as { ok: unknown }).ok === false
  ) {
    const singleError =
      typeof (result as { error?: unknown }).error === "object" &&
      (result as { error?: unknown }).error !== null
        ? ((result as { error: { code?: string; message?: string; details?: { path?: string } } }).error)
        : null;
    const firstError = Array.isArray((result as { errors?: unknown }).errors)
      ? ((result as { errors: Array<{ code?: string; message?: string; path?: string }> }).errors[0] ?? null)
      : null;

    throw {
      code: firstError?.code ?? singleError?.code ?? "MUTATION_FAILED",
      message: firstError?.message ?? singleError?.message ?? "Mutation failed",
      details: {
        path: firstError?.path ?? singleError?.details?.path ?? "operation",
      },
    };
  }
}

function shouldFallbackToLegacySharePayload(error: unknown): boolean {
  if (readErrorCode(error) !== "DFQL_INVALID") {
    return false;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message.includes("shareWith.userId");
  }

  return false;
}

type ShareableLevel = "viewer" | "editor" | "owner";

async function shareMutationWithFallback(input: {
  id?: string;
  scope: "record" | "resource";
  principalId: string;
  level: ShareableLevel;
}): Promise<unknown> {
  const share = client.table("documents").share;
  if (!share) {
    throw { code: "DFQL_INVALID", message: "Share capability unavailable" };
  }

  try {
    return await share({
      id: input.id,
      principalId: input.principalId,
      level: input.level,
      scope: input.scope,
    });
  } catch (error) {
    if (!shouldFallbackToLegacySharePayload(error)) {
      throw error;
    }

    return client.table("documents").mutate({
      operation: "share",
      ...(input.id ? { id: input.id } : {}),
      scope: input.scope,
      shareWith: {
        userId: input.principalId,
        level: input.level,
      },
    });
  }
}

async function unshareMutationWithFallback(input: {
  id?: string;
  scope: "record" | "resource";
  principalId: string;
}): Promise<unknown> {
  const unshare = client.table("documents").unshare;
  if (!unshare) {
    throw { code: "DFQL_INVALID", message: "Unshare capability unavailable" };
  }

  try {
    return await unshare({
      id: input.id,
      principalId: input.principalId,
      scope: input.scope,
    });
  } catch (error) {
    if (!shouldFallbackToLegacySharePayload(error)) {
      throw error;
    }

    return client.table("documents").mutate({
      operation: "unshare",
      ...(input.id ? { id: input.id } : {}),
      scope: input.scope,
      shareWith: {
        userId: input.principalId,
      },
    });
  }
}

function isResourceScopeUnsupported(error: unknown): boolean {
  if (readErrorCode(error) !== "DFQL_INVALID") {
    return false;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    return message.includes("id must be string") || message.includes("scope");
  }

  return false;
}

async function queryVisibleDocumentIds(): Promise<string[]> {
  const result = await client.table("documents").query({
    operation: "find",
    sort: ["id:asc"],
  }) as { data?: Array<{ id?: unknown }> };

  return (result.data ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => id !== null);
}

async function applyTeamScopeFallbackViaRecords(input: {
  operation: "share" | "unshare";
}): Promise<{ affectedIds: string[] }> {
  const ids = await queryVisibleDocumentIds();

  for (const id of ids) {
    if (input.operation === "share") {
      const result = await shareMutationWithFallback({
        id,
        scope: "record",
        principalId: "team:design",
        level: "viewer",
      });
      assertMutationSuccess(result);
    } else {
      const result = await unshareMutationWithFallback({
        id,
        scope: "record",
        principalId: "team:design",
      });
      assertMutationSuccess(result);
    }
  }

  return { affectedIds: ids };
}

function normalizePermissionRows(input: unknown): PermissionGrant[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((row) => typeof row === "object" && row !== null)
    .map((row) => {
      const candidate = row as Record<string, unknown>;
      const principalId =
        typeof candidate.principalId === "string"
          ? candidate.principalId
          : typeof candidate.userId === "string"
            ? candidate.userId
            : "";

      return {
        principalId,
        level: typeof candidate.level === "string" ? candidate.level : "unknown",
        grantKind:
          typeof candidate.grantKind === "string" ? candidate.grantKind : undefined,
        sourceRef:
          candidate.sourceRef === null || typeof candidate.sourceRef === "string"
            ? candidate.sourceRef
            : undefined,
        resourceId:
          candidate.resourceId === null || typeof candidate.resourceId === "string"
            ? candidate.resourceId
            : undefined,
        grantedBy:
          typeof candidate.grantedBy === "string" ? candidate.grantedBy : undefined,
        grantedAt:
          typeof candidate.grantedAt === "number" ? candidate.grantedAt : undefined,
      } satisfies PermissionGrant;
    })
    .filter((row) => row.principalId.length > 0)
    .sort((a, b) =>
      `${a.principalId}:${a.grantKind ?? "record"}`.localeCompare(
        `${b.principalId}:${b.grantKind ?? "record"}`,
      ),
    );
}

function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return "sharing-app-client";
  }

  const key = "datafn-sharing-demo-client-id";
  const current = window.localStorage.getItem(key);
  if (current) {
    return current;
  }

  const created = `sharing-demo-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

const remoteAdapter = new DemoRemoteAdapter({
  baseUrl: `${DEMO_SERVER_ORIGIN}/datafn`,
  getIdentity: () => getDemoIdentity(),
});

const STORAGE_PREFIX = "sharing-app";
const storageFactory = (namespace: string) =>
  IndexedDbStorageAdapter.createForNamespace(
    STORAGE_PREFIX,
    namespace,
    undefined,
    schema,
  );

function makeSyncConfig() {
  return {
    mode: "sync" as const,
    offlinability: true,
    ws: false,
    pushInterval: 250,
    hydration: {
      bootResources: ["documents"],
    },
    remoteAdapter,
  };
}

export const client = createDatafnClient({
  schema,
  clientId: getOrCreateClientId(),
  namespace: get(demoSession).localNamespace,
  storage: storageFactory,
  sync: makeSyncConfig(),
});

clientNamespace.set(client.currentNamespace());

let unsubscribeSyncEvents: (() => void) | null = null;

client.subscribeClient((currentClient) => {
  clientNamespace.set(currentClient.currentNamespace());
  unsubscribeSyncEvents?.();
  unsubscribeSyncEvents = currentClient.subscribe((event) => {
    if (event.type === "sync_applied") {
      patchSyncStatus({
        running: true,
        lastEvent: "sync_applied",
      });
      return;
    }

    if (event.type === "sync_failed") {
      const code = readErrorCode((event as { context?: unknown }).context ?? null);
      patchSyncStatus({
        running: true,
        lastEvent: "sync_failed",
        lastErrorCode: code,
      });
      pushActivity({
        timestamp: Date.now(),
        level: "error",
        message: "Sync failed",
        code,
      });
      return;
    }

    if (event.type === "ws_connected") {
      patchSyncStatus({
        running: true,
        lastEvent: "ws_connected",
      });
      return;
    }

    if (event.type === "ws_disconnected") {
      patchSyncStatus({
        lastEvent: "ws_disconnected",
      });
    }
  });
});

function sessionKey(session: DemoSession) {
  return `${session.workspaceId}/${session.userId}`;
}

async function refreshContext() {
  try {
    const context = await fetchDemoContext(getDemoIdentity());
    serverContext.set(context);
    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: `Context resolved for ${context.workspaceId}/${context.actorId}`,
    });
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: "Context refresh failed",
      code,
    });
    throw error;
  }
}

function queueSessionSwitch(session: DemoSession): Promise<void> {
  switchChain = switchChain.catch(() => undefined).then(async () => {
    switchingSession.set(true);
    try {
      await client.switchContext({
        namespace: session.localNamespace,
        sync: makeSyncConfig(),
      });
      clientNamespace.set(client.currentNamespace());
      patchSyncStatus({
        running: true,
        lastEvent: "context_switched",
        lastErrorCode: undefined,
      });

      await client.sync.cloneNow();
      pushActivity({
        timestamp: Date.now(),
        level: "info",
        message: `Clone completed for ${session.workspaceId}/${session.userId}`,
      });

      await refreshContext();
      pushActivity({
        timestamp: Date.now(),
        level: "info",
        message: `Switched to ${session.workspaceId}/${session.userId}`,
      });
    } catch (error) {
      const code = readErrorCode(error);
      patchSyncStatus({
        running: true,
        lastEvent: "context_switch_failed",
        lastErrorCode: code,
      });
      pushActivity({
        timestamp: Date.now(),
        level: "error",
        message: "Session switch failed",
        code,
      });
      throw error;
    } finally {
      switchingSession.set(false);
    }
  });

  return switchChain;
}

let previousSessionKey = sessionKey(get(demoSession));

demoSession.subscribe((session) => {
  const next = sessionKey(session);
  if (!initialized || next === previousSessionKey) {
    previousSessionKey = next;
    return;
  }

  previousSessionKey = next;
  void queueSessionSwitch(session);
});

export async function initializeDemoClient() {
  await initializeDemoSession();
  initialized = true;
  await queueSessionSwitch(get(demoSession));
}

export async function createDocument(input: { title: string; content: string }) {
  try {
    const result = await client.table("documents").mutate({
      operation: "insert",
      record: {
        title: input.title,
        content: input.content,
      },
    });
    assertMutationSuccess(result);
    await reconcileNow("create document");

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: `Created document "${input.title}"`,
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: "Create document failed",
      code,
    });
    throw error;
  }
}

export async function saveDocument(input: {
  id: string;
  title: string;
  content: string;
}) {
  try {
    const result = await client.table("documents").mutate({
      operation: "merge",
      id: input.id,
      record: {
        title: input.title,
        content: input.content,
      },
    });
    assertMutationSuccess(result);
    await reconcileNow(`save ${input.id}`);

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: `Saved document ${input.id}`,
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: `Save failed for ${input.id}`,
      code,
    });
    throw error;
  }
}

export async function shareDocumentRecord(input: {
  id: string;
  principalId: string;
  level: ShareableLevel;
}) {
  try {
    const result = await shareMutationWithFallback({
      id: input.id,
      principalId: input.principalId,
      level: input.level,
      scope: "record",
    });
    assertMutationSuccess(result);
    await reconcileNow(`share ${input.id}`);

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: `Granted ${input.level} to ${input.principalId} on ${input.id}`,
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: `Share failed for ${input.principalId} on ${input.id}`,
      code,
    });
    throw error;
  }
}

export async function unshareDocumentRecord(input: {
  id: string;
  principalId: string;
}) {
  try {
    const result = await unshareMutationWithFallback({
      id: input.id,
      principalId: input.principalId,
      scope: "record",
    });
    assertMutationSuccess(result);
    await reconcileNow(`unshare ${input.id}`);

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: `Revoked ${input.principalId} on ${input.id}`,
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: `Unshare failed for ${input.principalId} on ${input.id}`,
      code,
    });
    throw error;
  }
}

export async function grantTeamDesignScopeViewer() {
  try {
    let result: unknown;
    let usedRecordFallback = false;

    try {
      result = await shareMutationWithFallback({
        scope: "resource",
        principalId: "team:design",
        level: "viewer",
      });
    } catch (error) {
      if (!isResourceScopeUnsupported(error)) {
        throw error;
      }

      usedRecordFallback = true;
      result = await applyTeamScopeFallbackViaRecords({ operation: "share" });
    }
    assertMutationSuccess(result);
    await reconcileNow("scope grant team:design");

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: usedRecordFallback
        ? "Applied team:design record-grant fallback for current workspace"
        : "Applied scope grant: team:design -> viewer",
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: "Scope grant failed for team:design",
      code,
    });
    throw error;
  }
}

export async function revokeTeamDesignScopeGrant() {
  try {
    let result: unknown;
    let usedRecordFallback = false;

    try {
      result = await unshareMutationWithFallback({
        scope: "resource",
        principalId: "team:design",
      });
    } catch (error) {
      if (!isResourceScopeUnsupported(error)) {
        throw error;
      }

      usedRecordFallback = true;
      result = await applyTeamScopeFallbackViaRecords({ operation: "unshare" });
    }
    assertMutationSuccess(result);
    await reconcileNow("scope unshare team:design");

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: usedRecordFallback
        ? "Revoked team:design record-grant fallback for current workspace"
        : "Revoked scope grant: team:design",
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: "Scope unshare failed for team:design",
      code,
    });
    throw error;
  }
}

export async function attemptCrossWorkspaceShare(input: {
  id: string;
  targetWorkspaceId: DemoWorkspaceId;
  principalId: DemoUserId;
}) {
  try {
    const result = await client.table("documents").mutate({
      operation: "share",
      id: input.id,
      shareWith: {
        userId: `workspace:${input.targetWorkspaceId}:${input.principalId}`,
        level: "viewer",
      },
    });
    assertMutationSuccess(result);

    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: "Unexpected cross-workspace share success",
    });

    return result;
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: `Cross-workspace share denied for ${input.targetWorkspaceId}`,
      code,
    });
    throw error;
  }
}

export async function fetchDocumentPermissions(id: string): Promise<PermissionGrant[]> {
  try {
    const getPermissions = client.table("documents").getPermissions;
    if (!getPermissions) {
      throw { code: "DFQL_INVALID", message: "Permissions capability unavailable" };
    }

    const result = await getPermissions(id);
    return normalizePermissionRows(result);
  } catch (error) {
    const code = readErrorCode(error);
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: `Permission fetch failed for ${id}`,
      code,
    });
    throw error;
  }
}

export async function pullNow() {
  patchSyncStatus({
    pullInProgress: true,
    lastEvent: "pull_started",
    lastErrorCode: undefined,
  });

  try {
    await client.sync.pullNow();
    await client.sync.cloneNow();
    patchSyncStatus({
      running: true,
      pullInProgress: false,
      lastPullAt: Date.now(),
      lastPullOutcome: "success",
      lastEvent: "pull_succeeded",
      lastErrorCode: undefined,
    });
    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: "Pull completed successfully",
    });
  } catch (error) {
    const code = readErrorCode(error);
    patchSyncStatus({
      running: true,
      pullInProgress: false,
      lastPullAt: Date.now(),
      lastPullOutcome: "error",
      lastEvent: "pull_failed",
      lastErrorCode: code,
    });
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: "Pull failed",
      code,
    });
    throw error;
  }
}

export async function resetBaselineAndResync(): Promise<DemoResetResult> {
  patchSyncStatus({
    resetInProgress: true,
    lastEvent: "reset_started",
    lastErrorCode: undefined,
  });

  try {
    const reset = await resetDemoBaseline();
    await client.clear();
    await client.sync.cloneNow();

    patchSyncStatus({
      running: true,
      resetInProgress: false,
      lastEvent: "reset_completed",
      lastErrorCode: undefined,
    });
    pushActivity({
      timestamp: Date.now(),
      level: "info",
      message: `Reset baseline and clone completed (${Object.values(reset.documentCounts).reduce((a, b) => a + b, 0)} docs)` ,
    });

    await refreshContext();
    return reset;
  } catch (error) {
    const code = readErrorCode(error);
    patchSyncStatus({
      running: true,
      resetInProgress: false,
      lastEvent: "reset_failed",
      lastErrorCode: code,
    });
    pushActivity({
      timestamp: Date.now(),
      level: "error",
      message: "Reset baseline failed",
      code,
    });
    throw error;
  }
}

export function readClientNamespace(): string | undefined {
  return client.currentNamespace();
}
