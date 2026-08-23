import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const environment = process.argv[2];
if (!["preview", "production"].includes(environment)) {
  console.error("Usage: node scripts/deploy-uifn-catalogs.mjs <preview|production> [--skip-build]");
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const catalogsRoot = path.join(repoRoot, "uifn", "catalogs");
const nodeBin = process.execPath;
const wranglerBin = path.join(repoRoot, "node_modules", ".bin", "wrangler");
const workerSourcePath = path.join(catalogsRoot, "worker.ts");
const workerBuildHash = createHash("sha256")
  .update(fs.readFileSync(workerSourcePath))
  .digest("hex");
const commandEnv = {
  ...process.env,
  PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ""}`,
};

if (!process.argv.includes("--skip-build")) {
  run(nodeBin, [path.join(repoRoot, "scripts", "build-uifn-catalogs.mjs")], repoRoot);
}

run(wranglerBin, [
  "deploy",
  "--config",
  path.join(catalogsRoot, "wrangler.jsonc"),
  "--env",
  environment,
  "--var",
  `UIFN_WORKER_BUILD_HASH:${workerBuildHash}`,
], catalogsRoot);

const deploymentOrigin =
  environment === "production"
    ? "https://uifn.dev"
    : "https://uifn-components-preview.21n.workers.dev";
const expectedManifest = JSON.parse(
  fs.readFileSync(path.join(catalogsRoot, "dist", "catalog-manifest.json"), "utf8"),
);

await waitForDeploymentReadiness(
  deploymentOrigin,
  expectedManifest,
  workerBuildHash,
);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: commandEnv,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitForDeploymentReadiness(origin, expected, expectedWorkerBuildHash) {
  const attempts = 30;
  const sentinelPaths = [
    "/catalog-manifest.json",
    "/components/",
    "/components/react/components/dialog",
    "/components/svelte/components/dialog",
    "/components/solid/components/dialog",
    "/components/react/does-not-exist",
  ];
  let consecutiveReadyChecks = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const sentinels = await Promise.all(sentinelPaths.map(async (sentinelPath) => {
        const response = await fetch(`${origin}${sentinelPath}`, {
          headers: {
            "user-agent": "uifn-catalog-deployment-readiness/1.0",
          },
        });
        const delivered = sentinelPath === "/catalog-manifest.json" && response.ok
          ? await response.json()
          : undefined;
        const expectedStatus = sentinelPath.endsWith("does-not-exist") ? 404 : 200;
        const contentSecurityPolicy =
          response.headers.get("content-security-policy") ?? "";
        const ready =
          response.status === expectedStatus &&
          response.headers.get("x-uifn-catalog-build") === expected.generatedAt &&
          response.headers.get("x-uifn-catalog-worker") === expectedWorkerBuildHash &&
          contentSecurityPolicy.includes("https://static.cloudflareinsights.com") &&
          contentSecurityPolicy.includes("https://cloudflareinsights.com") &&
          (
            sentinelPath !== "/catalog-manifest.json" ||
            (
              delivered?.generatedAt === expected.generatedAt &&
              delivered?.inventory?.components === expected.inventory.components &&
              delivered?.routes?.staticallyAddressable ===
                expected.routes.staticallyAddressable
            )
          );
        return { sentinelPath, ready };
      }));
      const pendingPaths = sentinels
        .filter((sentinel) => !sentinel.ready)
        .map((sentinel) => sentinel.sentinelPath);
      const ready = pendingPaths.length === 0;

      if (ready) {
        consecutiveReadyChecks += 1;
        if (consecutiveReadyChecks >= 2) {
          console.log(
            `Deployment ready at ${origin}: ${expected.inventory.components} components, ` +
              `${expected.routes.staticallyAddressable} static framework routes, ` +
              `Worker ${expectedWorkerBuildHash.slice(0, 12)}, ` +
              `${sentinelPaths.length} sentinels stable twice.`,
          );
          return;
        }
      } else {
        consecutiveReadyChecks = 0;
      }

      console.log(
        `Waiting for ${origin} to serve catalog build ${expected.generatedAt} ` +
          `(attempt ${attempt}/${attempts}; ` +
          `${ready ? "confirming all sentinels" : `pending ${pendingPaths.join(", ")}`}).`,
      );
    } catch (error) {
      console.log(
        `Waiting for ${origin} after ${error instanceof Error ? error.message : String(error)} ` +
          `(attempt ${attempt}/${attempts}).`,
      );
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }

  throw new Error(
    `Deployment did not become ready at ${origin} after ${attempts} attempts. ` +
      `Expected catalog build ${expected.generatedAt}.`,
  );
}
