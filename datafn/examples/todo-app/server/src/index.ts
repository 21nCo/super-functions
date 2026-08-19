import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDatafnServer } from "@datafn/server";
import { ElasticsearchAdapter } from "@searchfn/adapter-elasticsearch";
import { MemoryAdapter } from "@searchfn/adapter-memory";
import { createSearchProvider } from "@searchfn/datafn-provider";
import { toHono } from "@superfunctions/http-hono";
import { adapter } from "./db.js";
import schema from "./schema.datafn.js";

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

function parseNodeUrl(raw: string) {
  const parsed = new URL(raw);
  const auth = parsed.username
    ? { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) }
    : undefined;
  parsed.username = "";
  parsed.password = "";
  return { node: parsed.toString().replace(/\/$/, ""), auth };
}

const searchLogger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => console.log(`[search:debug] ${msg}`, ctx ?? ""),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(`[search:warn] ${msg}`, ctx ?? ""),
  error: (msg: string, ctx?: Record<string, unknown>) => console.error(`[search:error] ${msg}`, ctx ?? ""),
};

function createSearchAdapter() {
  const openSearchUrl = process.env.OPENSEARCH_URL?.trim();
  const elasticsearchUrl = process.env.ELASTICSEARCH_URL?.trim();

  if (openSearchUrl) {
    const { node, auth } = parseNodeUrl(openSearchUrl);
    return {
      label: "opensearch",
      adapter: new ElasticsearchAdapter({
        node,
        auth,
        engine: "opensearch",
        indexPrefix: "todo_app",
        defaults: SEARCH_DEFAULTS,
        requestTimeoutMs: 10_000,
        logger: searchLogger,
        retry: {
          maxRetries: 3,
          baseDelayMs: 100,
          maxDelayMs: 5_000,
        },
      }),
    };
  }

  if (elasticsearchUrl) {
    const { node, auth } = parseNodeUrl(elasticsearchUrl);
    return {
      label: "elasticsearch",
      adapter: new ElasticsearchAdapter({
        node,
        auth,
        engine: "elasticsearch",
        indexPrefix: "todo_app",
        defaults: SEARCH_DEFAULTS,
        requestTimeoutMs: 10_000,
        retry: {
          maxRetries: 3,
          baseDelayMs: 100,
          maxDelayMs: 5_000,
        },
      }),
    };
  }

  return {
    label: "memory",
    adapter: new MemoryAdapter({
      defaults: SEARCH_DEFAULTS,
    }),
  };
}

async function main() {
  const { adapter: searchAdapter, label: searchAdapterLabel } = createSearchAdapter();
  const searchProvider = createSearchProvider(searchAdapter, {
    resourceFields: SEARCH_RESOURCE_FIELDS,
  });

  // ── Create DataFn Server ───────────────────────────────────────────
  const datafn = await createDatafnServer({
    schema,
    database: adapter,
    searchProvider,

    // Authorization — allow everything in this example.
    // In production, inspect ctx (headers / session) and restrict per action.
    authorize: async (_ctx: any, _action: any, _payload: any) => true,

    // Namespace provider — hardcoded namespace so scoping can be verified.
    // Replace with real session/token extraction in production.
    // namespaceProvider: {
    //   getNamespace: (_ctx: any) => ns("user", _ctx.parsedBody?.clientId ?? "anonymous"),
    //   getActorId: (_ctx: any) => _ctx.parsedBody?.clientId ?? "anonymous",
    // },
    namespaceProvider: {
      getNamespace: (_ctx: any) => "multiclienttest",
      getActorId: (_ctx: any) => "multiclienttestuser",
    },

    // Limits
    limits: {
      maxLimit: 200,
      maxTransactSteps: 50,
    },
  });

  // ── Reindex existing records into search (one-time) ─────────────────
  if (process.env.REINDEX === "true") {
    const resources = ["todos", "categories"] as const;
    for (const resource of resources) {
      const records = await adapter.findMany({
        model: resource as string,
        where: [],
        namespace: "multiclienttest",
      });
      if (records.length > 0) {
        await searchProvider.updateIndices({
          resource: resource as string,
          records: records as Record<string, unknown>[],
          operation: "upsert",
        });
        console.log(`  Reindexed ${records.length} ${resource} into search`);
      }
    }
    console.log("  Reindex complete");
  }

  // ── Hono HTTP App ──────────────────────────────────────────────────
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["Content-Length"],
      maxAge: 86400,
      credentials: false,
    }),
  );

  // Mount all DataFn routes at /
  const datafnApp = toHono(datafn.router);
  app.route("/", datafnApp);

  // ── Start server ───────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001);
  console.log(`DataFn Todo Server running → http://localhost:${port}`);
  console.log(`  POST /datafn/query      — execute queries`);
  console.log(`  POST /datafn/mutation    — execute mutations`);
  console.log(`  POST /datafn/transact    — execute transactions`);
  console.log(`  POST /datafn/search      — cross-resource search`);
  console.log(`  POST /datafn/clone       — full sync download`);
  console.log(`  POST /datafn/pull        — incremental sync`);
  console.log(`  POST /datafn/push        — upload local mutations`);
  console.log(`  GET  /datafn/status      — server status`);
  console.log(`  Search adapter: ${searchAdapterLabel}`);

  serve({ fetch: app.fetch, port });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
