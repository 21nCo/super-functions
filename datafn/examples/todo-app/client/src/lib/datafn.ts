import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";
import type { DatafnPlugin } from "@datafn/core";
import { IndexedDbAdapter } from "@searchfn/adapter-indexeddb";
import { createSearchProvider } from "@searchfn/datafn-provider";
import schema from "todo-app-server/schema";

export { schema };

// ---------------------------------------------------------------------------
// Audit-log plugin — demonstrates the plugin system
// ---------------------------------------------------------------------------

export type AuditEntry = {
  timestamp: number;
  env: string;
  phase: string;
  detail: string;
};

/** Shared mutable log so the UI can display recent events. */
export const auditLog: AuditEntry[] = [];
const MAX_LOG = 50;

function pushAudit(entry: AuditEntry) {
  auditLog.unshift(entry);
  if (auditLog.length > MAX_LOG) auditLog.length = MAX_LOG;
}

const auditPlugin: DatafnPlugin = {
  name: "audit-log",
  runsOn: ["client"],

  afterMutation(_ctx, mutation, result) {
    const m = Array.isArray(mutation) ? mutation : [mutation];
    for (const mut of m) {
      const op = (mut as any).operation ?? "unknown";
      const resource = (mut as any).resource ?? "?";
      pushAudit({
        timestamp: Date.now(),
        env: "client",
        phase: "mutation",
        detail: `${op} on ${resource} → ${(result as any)?.ok ? "ok" : "err"}`,
      });
    }
  },

  afterSync(_ctx, phase, _payload, result) {
    pushAudit({
      timestamp: Date.now(),
      env: "client",
      phase: `sync:${phase}`,
      detail: `${(result as any)?.ok ? "ok" : "err"}`,
    });
  },
};

// ---------------------------------------------------------------------------
// Mode type
// ---------------------------------------------------------------------------

export type AppMode = "sync" | "local-only";

/** Persist a stable clientId in localStorage. */
function getOrCreateClientId(): string {
  const KEY = "datafn-todo-client-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "client-" + crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function makeSyncConfig(mode: AppMode) {
  if (mode === "local-only") {
    return { mode: "local-only" as const };
  }
  return {
    mode: "sync" as const,
    offlinability: true,
    remote: "http://localhost:3001/datafn",
    ws: false,
    pushInterval: 2000,
    pushBatchSize: 100,
    pushMaxRetries: 3,
    hydration: {
      bootResources: ["todos", "categories"],
    },
  };
}

// ---------------------------------------------------------------------------
// Namespace — scope data by the stable clientId
// ---------------------------------------------------------------------------

const clientId = getOrCreateClientId();
const namespace = "multiclienttest";
const SEARCH_RESOURCE_FIELDS: Record<string, string[]> = {
  todos: ["text"],
  categories: ["name"],
};
const SEARCH_DEFAULTS = {
  prefix: true,
  fuzzy: 0.2,
  fieldBoosts: {
    text: 2,
    name: 1,
  },
};
const searchProvider = createSearchProvider(
  new IndexedDbAdapter({
    dbName: "todo-app-search",
    defaults: SEARCH_DEFAULTS,
  }),
  {
    resourceFields: SEARCH_RESOURCE_FIELDS,
  },
);

// ---------------------------------------------------------------------------
// Unified client — stable Proxy reference with built-in mode switching
// ---------------------------------------------------------------------------

export const client = createDatafnClient({
  schema,
  clientId,
  namespace,
  storage: (ns) =>
    IndexedDbStorageAdapter.createForNamespace("todo-app", ns as string, undefined, schema),
  searchProvider,
  plugins: [auditPlugin],
  sync: makeSyncConfig("sync"),
});

/**
 * Switch the client between sync and local-only mode.
 * Creates a fresh storage adapter on each switch (same namespace, new connection).
 * Sync is auto-started by switchContext when switching to "sync" mode.
 */
export async function switchMode(mode: AppMode): Promise<void> {
  console.log("[DEBUG] switchMode called with mode:", mode);
  await client.switchContext({
    sync: makeSyncConfig(mode),
    storage: IndexedDbStorageAdapter.createForNamespace(
      "todo-app", namespace, undefined, schema,
    ),
  });
}
