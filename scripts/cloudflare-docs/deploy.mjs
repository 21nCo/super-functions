import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  docsProducts,
  hasDocsPackage,
  normalizeEnvironment,
  parseProducts,
  repoRoot,
  workerName,
} from "./config.mjs";

const environment = normalizeEnvironment(process.argv[2] ?? "dev");
if (!environment) {
  console.error("Usage: node scripts/cloudflare-docs/deploy.mjs <dev|live> [--products=datafn,searchfn,authfn|all] [--dry-run] [--skip-build]");
  process.exit(1);
}

const products = parseProducts(getArgValue("products") ?? "all", { existingOnly: false });
const dryRun = hasFlag("dry-run");
const skipBuild = hasFlag("skip-build");

for (const productId of products) {
  if (!hasDocsPackage(productId)) {
    throw new Error(`Cannot deploy ${productId} docs because ${docsProducts[productId].docsDir}/package.json does not exist.`);
  }

  const product = docsProducts[productId];
  const docsDir = path.join(repoRoot, product.docsDir);
  const name = workerName(productId, environment);

  if (!skipBuild) {
    buildDocs(product, docsDir, environment);
  }

  if (product.kind === "next-static") {
    deployNextStatic(productId, docsDir, name);
  } else if (product.kind === "sveltekit-cloudflare") {
    deploySvelteKitCloudflare(docsDir, name);
  } else {
    throw new Error(`Unsupported docs deployment kind: ${product.kind}`);
  }
}

function buildDocs(product, docsDir, environment) {
  const assetsOrigin = product.kind === "sveltekit-cloudflare"
    ? `https://${product.hosts[environment]}`
    : `https://${product.hosts[environment]}/docs`;

  run("npm", ["--workspace", product.packageName, "run", "build"], {
    cwd: repoRoot,
    env: {
      CLOUDFLARE_DOCS_DEPLOY: "1",
      CLOUDFLARE_DOCS_ASSETS_ORIGIN: assetsOrigin,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
}

function deployNextStatic(productId, docsDir, name) {
  const outDir = path.join(docsDir, "out");
  const docsIndex = path.join(outDir, "docs", "index.html");
  assertFile(docsIndex, `${productId} docs static export did not produce ${path.relative(repoRoot, docsIndex)}`);

  const stageDir = path.join(docsDir, ".cloudflare-docs-assets");
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  copyDir(outDir, stageDir);

  const nextAssets = path.join(outDir, "_next");
  if (fs.existsSync(nextAssets)) {
    copyDir(nextAssets, path.join(stageDir, "docs", "_next"));
  }

  const apiAssets = path.join(outDir, "api");
  if (fs.existsSync(apiAssets)) {
    copyDir(apiAssets, path.join(stageDir, "docs", "api"));
  }

  const wranglerConfig = writeWranglerConfig(docsDir, {
    name,
    assetsDirectory: ".cloudflare-docs-assets",
  });
  runWranglerDeploy(docsDir, wranglerConfig, name);
}

function deploySvelteKitCloudflare(docsDir, name) {
  const cloudflareOutputDir = path.join(docsDir, ".svelte-kit", "cloudflare");
  const workerEntry = path.join(cloudflareOutputDir, "_worker.js");
  assertFile(workerEntry, `SvelteKit Cloudflare build did not produce ${path.relative(repoRoot, workerEntry)}`);
  fs.writeFileSync(path.join(cloudflareOutputDir, ".assetsignore"), "_worker.js\n");

  const wranglerConfig = writeWranglerConfig(docsDir, {
    name,
    main: ".svelte-kit/cloudflare/_worker.js",
    assetsDirectory: ".svelte-kit/cloudflare",
    compatibilityFlags: ["nodejs_compat"],
  });
  runWranglerDeploy(docsDir, wranglerConfig, name);
}

function writeWranglerConfig(docsDir, options) {
  const configPath = path.join(docsDir, ".cloudflare-docs-wrangler.jsonc");
  const config = {
    name: options.name,
    compatibility_date: "2026-05-18",
    workers_dev: true,
    observability: {
      enabled: true,
    },
    assets: {
      directory: options.assetsDirectory,
    },
  };
  if (options.main) config.main = options.main;
  if (options.compatibilityFlags) config.compatibility_flags = options.compatibilityFlags;

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

function runWranglerDeploy(cwd, configPath, name) {
  run(resolveWranglerBin(), [
    "deploy",
    "--config",
    configPath,
    ...(dryRun ? ["--dry-run"] : []),
  ], { cwd });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function assertFile(filePath, message) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(message);
  }
}

function resolveWranglerBin() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const localBin = path.join(repoRoot, "node_modules", ".bin", `wrangler${extension}`);
  if (fs.existsSync(localBin)) return localBin;
  return "wrangler";
}

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getArgValue(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}
