import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as toYaml } from "yaml";
import { fromRouter } from "@apifn/core";
import type { ApifnConfig } from "../config.js";
import { loadRouter } from "../utils/router-loader.js";
import type { Output } from "../utils/output.js";

export async function runGenerateCommand(options: {
  routerPath?: string;
  outputPath?: string;
  cwd?: string;
  config: ApifnConfig;
  output: Output;
}): Promise<{ routeCount: number; outputPath: string }> {
  const cwd = options.cwd ?? process.cwd();
  const routerPath = options.routerPath ?? options.config.router;

  if (!routerPath) {
    throw new Error("Router path is required. Pass [router-path] or set config.router.");
  }

  const router = await loadRouter(routerPath, cwd);
  const routes = router.getRoutes();

  const configuredInfo = options.config.openapi?.info;
  const doc = fromRouter(router, {
    info: {
      title: "API",
      version: "1.0.0",
      ...configuredInfo,
    },
    servers: options.config.openapi?.servers,
  });

  const outputPath = options.outputPath
    ? path.resolve(cwd, options.outputPath)
    : path.resolve(cwd, options.config.output ?? ".apifn", "openapi.yml");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toYaml(doc), "utf8");

  options.output.success(`Generated OpenAPI for ${routes.length} routes -> ${outputPath}`);

  return {
    routeCount: routes.length,
    outputPath,
  };
}
