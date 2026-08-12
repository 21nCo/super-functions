import { createJiti } from "jiti";
import path from "node:path";
import type { Router } from "@superfunctions/http";

function isRouter(value: unknown): value is Router<unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Router<unknown>).getRoutes === "function"
  );
}

export async function loadRouter(
  routerPath: string,
  cwd = process.cwd()
): Promise<Router<unknown>> {
  const resolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(cwd, routerPath);
  const jiti = createJiti(cwd, { moduleCache: false });
  const loaded = await jiti.import(resolved) as Record<string, unknown>;

  const candidates = [loaded?.default, loaded?.router, loaded];
  const router = candidates.find((candidate) => isRouter(candidate));

  if (!router) {
    throw new Error(
      `Router export not found in ${resolved}. Expected default export or named export 'router'.`
    );
  }

  return router;
}
