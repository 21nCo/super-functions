import { serve } from "@hono/node-server";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDatafnServer } from "@datafn/server";
import { adapter } from "./db.js";
import schema from "./schema.datafn.js";
import { getDemoBootstrapPayload } from "./demo/bootstrap.js";
import {
  parseDemoIdentityFromHeaders,
  requireCurrentDemoIdentity,
  runWithDemoIdentity,
} from "./demo/identity.js";
import { executeDemoReset } from "./demo/reset.js";
import { resolveEffectivePrincipalsForContext, resetAndSeedBaseline } from "./demo/seed.js";
import { validateDemoCrossWorkspaceSharing } from "./demo/share-validation.js";

export async function createSharingDemoApp() {
  const db = adapter;
  await db.initialize();
  await resetAndSeedBaseline(db);

  const datafn = await createDatafnServer({
    schema,
    db,
    allowUnknownResources: true,
    authorize: async () => true,
    namespaceProvider: {
      getNamespace: () => requireCurrentDemoIdentity().namespace,
      getActorId: () => requireCurrentDemoIdentity().actorId,
    },
  });

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "x-demo-workspace-id",
        "x-demo-user-id",
      ],
      exposeHeaders: ["Content-Length"],
      maxAge: 86400,
      credentials: false,
    }),
  );

  app.get("/demo/bootstrap", (c) => {
    return c.json({
      ok: true,
      result: getDemoBootstrapPayload(),
    });
  });

  app.get("/demo/context", async (c) => {
    const parsedIdentity = parseDemoIdentityFromHeaders(c.req.raw.headers);
    if (!parsedIdentity.ok) {
      return c.json(parsedIdentity.error, 400);
    }

    return runWithDemoIdentity(parsedIdentity.result, async () => {
      const principals = await resolveEffectivePrincipalsForContext(
        db,
        parsedIdentity.result.namespace,
        parsedIdentity.result.actorId,
      );

      return c.json({
        ok: true,
        result: {
          workspaceId: parsedIdentity.result.workspaceId,
          namespace: parsedIdentity.result.namespace,
          actorId: parsedIdentity.result.actorId,
          effectivePrincipals: principals,
        },
      });
    });
  });

  app.post("/demo/reset", async (c) => {
    let body: unknown = undefined;
    try {
      body = await c.req.json();
    } catch {
      body = undefined;
    }

    const resetResult = await executeDemoReset(db, body);
    if (!resetResult.ok) {
      const status = resetResult.error.details?.path === "scenario" ? 400 : 500;
      return c.json(resetResult, status);
    }

    return c.json(resetResult);
  });

  app.all("/datafn/*", async (c) => {
    const parsedIdentity = parseDemoIdentityFromHeaders(c.req.raw.headers);
    if (!parsedIdentity.ok) {
      return c.json(parsedIdentity.error, 400);
    }

    if (c.req.method === "POST") {
      let payload: unknown = undefined;
      try {
        payload = await c.req.raw.clone().json();
      } catch {
        payload = undefined;
      }

      const shareValidation = validateDemoCrossWorkspaceSharing({
        workspaceId: parsedIdentity.result.workspaceId,
        payload,
      });

      if (!shareValidation.ok) {
        return c.json(shareValidation.error, 400);
      }
    }

    return runWithDemoIdentity(parsedIdentity.result, async () => {
      return datafn.router.handle(c.req.raw);
    });
  });

  return { app, db, datafn };
}

async function main() {
  const { app } = await createSharingDemoApp();
  const port = Number(process.env.PORT ?? 3001);

  console.log(`DataFn Sharing Demo Server running → http://localhost:${port}`);
  console.log("  GET  /demo/bootstrap");
  console.log("  GET  /demo/context");
  console.log("  POST /demo/reset");
  console.log("  GET  /datafn/status");
  console.log("  POST /datafn/query");
  console.log("  POST /datafn/mutation");
  console.log("  POST /datafn/transact");
  console.log("  POST /datafn/clone");
  console.log("  POST /datafn/pull");
  console.log("  POST /datafn/push");

  serve({
    fetch: app.fetch,
    port,
  });
}

const isEntryPoint =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
