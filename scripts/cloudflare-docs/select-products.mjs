import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  existingProductIds,
  jsonArray,
  normalizeEnvironment,
  parseProducts,
  productIds,
} from "./config.mjs";

const eventName = process.env.EVENT_NAME ?? "";
const inputEnvironment = process.env.INPUT_ENVIRONMENT ?? "dev";
const inputProduct = process.env.INPUT_PRODUCT ?? "all";
const refType = process.env.REF_TYPE ?? "";
const refName = process.env.REF_NAME ?? "";

let environment;
let products;

if (eventName === "workflow_dispatch") {
  environment = normalizeEnvironment(inputEnvironment);
  if (!environment) fail(`Invalid docs environment: ${inputEnvironment}`);
  if (environment === "live") assertLiveTag(refType, refName);
  products = parseProducts(inputProduct, { existingOnly: inputProduct === "all" });
} else if (refType === "tag") {
  environment = "live";
  const product = productFromLiveTag(refName);
  if (!product) fail(`Tag '${refName}' does not match a Superfunctions docs deploy target.`);
  products = product === "all" ? existingProductIds() : [product];
} else {
  environment = "dev";
  products = productsFromChangedFiles();
}

console.log(`environment=${environment}`);
console.log(`products=${jsonArray(products)}`);

function productsFromChangedFiles() {
  const before = resolveBeforeRef();
  const after = process.env.AFTER ?? "HEAD";
  const changedFiles = git(["diff", "--name-only", before, after]).split("\n").filter(Boolean);

  const selected = new Set();
  const selectExisting = (productId) => {
    if (existingProductIds().includes(productId)) selected.add(productId);
  };

  for (const file of changedFiles) {
    if (/^(package\.json|package-lock\.json|turbo\.json|scripts\/cloudflare-docs\/|\.github\/workflows\/superfunctions-docs-cloudflare-)/.test(file)) {
      return existingProductIds();
    }
    if (/^packages\/docs-theme\//.test(file)) {
      for (const productId of existingProductIds()) selectExisting(productId);
      continue;
    }
    if (/^docsfn\//.test(file)) {
      selectExisting("authfn");
      continue;
    }
    if (/^datafn\/docs\//.test(file)) selectExisting("datafn");
    if (/^filefn\/docs\//.test(file)) selectExisting("filefn");
    if (/^searchfn\/docs\//.test(file)) selectExisting("searchfn");
    if (/^authfn\/docs\//.test(file)) selectExisting("authfn");
  }

  return [...selected];
}

function resolveBeforeRef() {
  const before = process.env.BEFORE ?? "";
  if (before && before !== "0000000000000000000000000000000000000000") {
    return before;
  }
  const after = process.env.AFTER ?? "HEAD";
  return git(["rev-parse", `${after}^`]);
}

function productFromLiveTag(tag) {
  if (/^superfunctions-docs-live-/.test(tag)) return "all";

  for (const productId of productIds()) {
    const accepted = [
      `superfunctions-docs-${productId}-live-`,
      `superfunctions-${productId}-docs-live-`,
    ];
    if (accepted.some((prefix) => tag.startsWith(prefix))) return productId;
  }

  return null;
}

function assertLiveTag(type, name) {
  if (type !== "tag" || !productFromLiveTag(name)) {
    fail("Live docs deploys must run from a Superfunctions docs live tag.");
  }
}

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
