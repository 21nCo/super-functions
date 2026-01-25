import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createDatafnServer } from "@datafn/server";
import { toHono } from "@superfunctions/http-hono";
import { adapter } from "./db.js";
import { datafnSchema } from "./schema.js";

async function main() {
  // Create DataFn Server
  const datafn = await createDatafnServer({
    schema: datafnSchema,
    db: adapter,
    authorize: async (ctx: any, action: any, payload: any) => {
      // Allow all for example
      return true;
    },
  });

  // Create Hono App
  const app = new Hono();

  // Mount DataFn routes
  // `toHono` converts the internal router to a Hono app or router
  const datafnApp = toHono(datafn.router);
  app.route("/", datafnApp);

  const port = 3000;
  console.log(`Server is running on http://localhost:${port}`);

  serve({
    fetch: app.fetch,
    port,
  });
}

main().catch(console.error);
