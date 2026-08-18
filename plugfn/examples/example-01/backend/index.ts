import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { toHono } from "@superfunctions/http-hono";
import { createPlugFnRouter } from "plugfn";
import {
  githubProvider,
  linearProvider,
  gmailProvider,
} from "@plugfn/providers";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as plugfnDrizzle from "./src/db/generated/plugfn-schema.js";
import { createExamplePlug } from "./src/plugfn.js";
import "dotenv/config";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: (origin) =>
      origin &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ? origin
        : "http://localhost:5173",
    credentials: true,
  }),
);

const dbUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:6432/plugfn_example_01";
const sql = postgres(dbUrl);
const db = drizzle(sql, { schema: plugfnDrizzle });

const adapter = drizzleAdapter({
  db,
  dialect: "postgres",
});

const authProvider = {
  authenticate: (_request: Request) => ({
    userId: "user_123",
    tenantId: "tenant_abc",
  }),
  getUserId: async (_request: unknown) => "user_123",
  requireAuth: async (_request: unknown) => "user_123",
};

const plug = createExamplePlug({
  database: adapter,
  auth: authProvider,
});

plug.providers.register(githubProvider);
plug.providers.register(linearProvider);
plug.providers.register(gmailProvider);

const router = createPlugFnRouter(plug, {
  authenticate: (_req) => ({ userId: "user_123", tenantId: "tenant_abc" }),
  defaultReturnTo:
    process.env.FRONTEND_URL?.replace(/\/+$/, "") || "http://localhost:5173",
});

app.route("/api/plugfn", toHono(router));

app.get("/api/data/:provider", async (c) => {
  const provider = c.req.param("provider");
  const userId = "user_123";

  try {
    let data;
    if (provider === "github") {
      data = await plug.action(provider, "issues.list", {
        userId,
        params: { owner: "21nCo", repo: "super-functions" },
      });
    } else if (provider === "linear") {
      const teamId =
        process.env.LINEAR_TEAM_ID ??
        (
          await plug.action<{ nodes: Array<{ id: string }> }>(
            provider,
            "teams.list",
            { userId, params: { first: 1 } },
          )
        ).nodes[0]?.id;

      if (!teamId) {
        return c.json({ error: "No Linear teams found for this connection" }, 404);
      }

      const issues = await plug.action<{ nodes: unknown[] }>(
        provider,
        "issues.list",
        { userId, params: { teamId, first: 10 } },
      );
      data = issues.nodes;
    } else if (provider === "gmail") {
      const syncResult = await plug.action<{
        messages: Array<{
          providerMessageId: string;
          subject?: string;
          from: string;
          snippet?: string;
          receivedAt: string;
        }>;
      }>(provider, "mail.sync", {
        userId,
        params: {
          tenantId: "tenant_abc",
          mode: "full",
          pageSize: 5,
          featureMode: "snippet",
        },
      });

      data = syncResult.messages.map((message) => ({
        id: message.providerMessageId,
        subject: message.subject ?? "(no subject)",
        from: message.from,
        snippet: message.snippet ?? "",
        receivedAt: message.receivedAt,
      }));
    } else {
      return c.json({ error: "Unsupported provider action mock" }, 400);
    }

    return c.json(Array.isArray(data) ? data : [data]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Action failed";
    console.error(`Error fetching data for ${provider}:`, error);
    return c.json({ error: message, details: error }, 500);
  }
});

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
