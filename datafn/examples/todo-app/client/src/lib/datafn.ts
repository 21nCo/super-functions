import { createDatafnClient, IndexedDbStorageAdapter, ns } from "@datafn/client";
import type { DatafnPlugin } from "@datafn/core";
import {
  createNativeBackedRemoteAdapter,
  createNativeBackedSearchProvider,
  createNativeBackedStorageAdapter,
  createNativeSyncController,
  createWKWebViewBridgeBus,
} from "@datafn/swift-bridge";
import { IndexedDbAdapter } from "@searchfn/adapter-indexeddb";
import { createSearchProvider } from "@searchfn/datafn-provider";
import schema from "todo-app-server/schema";

export { schema };

type ExampleNativeRemoteMode = "datafn-server" | "icloud";

type EmbeddedTopologyConfig = {
  topology: string;
  displayName?: string;
  namespace?: string;
  clientId?: string;
  schemaHash?: string;
  storage?: "indexeddb" | "native-backed";
  syncOwner?: "javascript" | "native";
  remoteMode?: ExampleNativeRemoteMode;
  remoteProfile?: string;
  indexedDbDisabled?: boolean;
  failIfUnavailable?: boolean;
  cloudKitContainerIdentifier?: string;
  webAppURL?: string;
};

declare global {
  interface Window {
    __DATAFN_EXAMPLE_TOPOLOGY__?: EmbeddedTopologyConfig;
    __DATAFN_NATIVE_CONFIG__?: EmbeddedTopologyConfig | undefined;
  }
}

const EXAMPLE_SCHEMA_HASH = "todo-app-example-v1";

function readEmbeddedTopology(): EmbeddedTopologyConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__DATAFN_EXAMPLE_TOPOLOGY__ ?? window.__DATAFN_NATIVE_CONFIG__ ?? null;
}

const embeddedTopology = readEmbeddedTopology();

export const isNativeBackedExample =
  embeddedTopology?.syncOwner === "native" &&
  embeddedTopology?.storage === "native-backed";

export const embeddedRemoteMode = embeddedTopology?.remoteMode ?? null;
export const topologyLabel = embeddedTopology?.displayName ??
  "Browser-owned IndexedDB + JavaScript sync";
export const searchTopologyLabel = isNativeBackedExample
  ? embeddedRemoteMode === "icloud"
    ? "Swift SearchFn via bridge (CloudKit records, local-only derived index)"
    : "Swift SearchFn via bridge"
  : "Browser SearchFn + IndexedDB";

// ---------------------------------------------------------------------------
// Audit-log plugin — demonstrates the plugin system
// ---------------------------------------------------------------------------

export type AuditEntry = {
  timestamp: number;
  env: string;
  phase: string;
  detail: string;
};

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
        env: isNativeBackedExample ? "native-webview" : "browser",
        phase: "mutation",
        detail: `${op} on ${resource} → ${(result as any)?.ok ? "ok" : "err"}`,
      });
    }
  },

  afterSync(_ctx, phase, _payload, result) {
    pushAudit({
      timestamp: Date.now(),
      env: isNativeBackedExample ? "native-webview" : "browser",
      phase: `sync:${phase}`,
      detail: `${(result as any)?.ok ? "ok" : "err"}`,
    });
  },
};

// ---------------------------------------------------------------------------
// Mode type
// ---------------------------------------------------------------------------

export type AppMode = "sync" | "local-only";

function getOrCreateClientId(): string {
  const KEY = "datafn-todo-client-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "client-" + crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

function makeBrowserSyncConfig(mode: AppMode) {
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

const clientId = embeddedTopology?.clientId ?? getOrCreateClientId();
const namespace = embeddedTopology?.namespace ?? ns("user", clientId);

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

const browserSearchProvider = createSearchProvider(
  new IndexedDbAdapter({
    dbName: "todo-app-search",
    defaults: SEARCH_DEFAULTS,
  }),
  {
    resourceFields: SEARCH_RESOURCE_FIELDS,
  },
);

function makeBrowserStorage() {
  return IndexedDbStorageAdapter.createForNamespace(
    "todo-app",
    namespace as string,
    undefined,
    schema,
  );
}

function makeNativeBackedContext(config: EmbeddedTopologyConfig) {
  const bridgeBus = createWKWebViewBridgeBus({ handlerName: "datafn" });

  return {
    storage: createNativeBackedStorageAdapter(bridgeBus),
    searchProvider: createNativeBackedSearchProvider(bridgeBus),
    sync: {
      owner: "native" as const,
      mode: "sync" as const,
      offlinability: true,
      remoteAdapter: createNativeBackedRemoteAdapter(bridgeBus),
      native: {
        syncController: createNativeSyncController(bridgeBus),
        remoteMode: (config.remoteMode ?? "datafn-server") as ExampleNativeRemoteMode,
        expectedSchemaHash: config.schemaHash ?? EXAMPLE_SCHEMA_HASH,
        failIfUnavailable: config.failIfUnavailable ?? true,
        ...(config.remoteProfile ? { remoteProfile: config.remoteProfile } : {}),
      },
    },
  };
}

const initialContext = isNativeBackedExample && embeddedTopology
  ? makeNativeBackedContext(embeddedTopology)
  : {
      storage: (nsValue: string) =>
        IndexedDbStorageAdapter.createForNamespace(
          "todo-app",
          nsValue,
          undefined,
          schema,
        ),
      searchProvider: browserSearchProvider,
      sync: makeBrowserSyncConfig("sync"),
    };

export const client = createDatafnClient({
  schema,
  clientId,
  namespace,
  storage: initialContext.storage as any,
  searchProvider: initialContext.searchProvider,
  plugins: [auditPlugin],
  sync: initialContext.sync,
});

export async function switchMode(mode: AppMode): Promise<void> {
  if (isNativeBackedExample) {
    pushAudit({
      timestamp: Date.now(),
      env: "native-webview",
      phase: "topology",
      detail: "Ignoring browser mode switch because Swift owns persistence and sync",
    });
    return;
  }

  await client.switchContext({
    sync: makeBrowserSyncConfig(mode),
    storage: makeBrowserStorage(),
    searchProvider: browserSearchProvider,
  });
}
