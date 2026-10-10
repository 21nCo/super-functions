import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Dev docs live in the 21n-dev Cloudflare account on the shared 21n.site zone,
// under each product's landing hostname (e.g. authfn.21n.site/docs*).
// Live docs stay on each product's own zone in the production account.
export const devAccountId = "c801efc2879825babdb9b2534199c4dd";
export const devZoneName = "21n.site";

export const docsProducts = {
  extfn: {
    packageName: "@extfn/docs",
    docsDir: "extfn/docs",
    kind: "sveltekit-cloudflare",
    zoneName: "extfn.com",
    hosts: {
      dev: "dev.extfn.com",
      live: "extfn.com",
    },
  },
  datafn: {
    packageName: "@datafn/docs",
    docsDir: "datafn/docs",
    kind: "next-static",
    zoneName: "datafn.dev",
    hosts: {
      dev: "datafn.21n.site",
      live: "datafn.dev",
    },
    routeAliases: {
      live: ["www.datafn.dev"],
    },
  },
  filefn: {
    packageName: "@filefn/docs",
    docsDir: "filefn/docs",
    kind: "sveltekit-cloudflare",
    zoneName: "filefn.com",
    hosts: {
      dev: "filefn.21n.site",
      live: "filefn.com",
    },
  },
  searchfn: {
    packageName: "@searchfn/docs",
    docsDir: "searchfn/docs",
    kind: "next-static",
    zoneName: "searchfn.com",
    hosts: {
      dev: "searchfn.21n.site",
      live: "searchfn.com",
    },
    routeAliases: {
      live: ["www.searchfn.com"],
    },
  },
  authfn: {
    packageName: "@authfn/docs",
    docsDir: "authfn/docs",
    kind: "sveltekit-cloudflare",
    zoneName: "authfn.com",
    hosts: {
      dev: "authfn.21n.site",
      live: "authfn.com",
    },
  },
};

export const environments = ["dev", "live"];

export function normalizeEnvironment(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return environments.includes(normalized) ? normalized : null;
}

export function productIds() {
  return Object.keys(docsProducts);
}

export function existingProductIds() {
  return productIds().filter((productId) => hasDocsPackage(productId));
}

export function parseProducts(value, { existingOnly = false } = {}) {
  const raw = String(value ?? "all").trim();
  const available = existingOnly ? existingProductIds() : productIds();
  if (raw === "all") return available;

  const selected = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (selected.length === 0) {
    throw new Error("At least one docs product is required.");
  }

  for (const productId of selected) {
    if (!docsProducts[productId]) {
      throw new Error(`Invalid docs product: ${productId}`);
    }
    if (existingOnly && !hasDocsPackage(productId)) {
      throw new Error(`Docs package is missing for ${productId}: ${docsProducts[productId].docsDir}/package.json`);
    }
  }

  return [...new Set(selected)];
}

export function hasDocsPackage(productId) {
  return fs.existsSync(path.join(repoRoot, docsProducts[productId].docsDir, "package.json"));
}

export function workerName(productId, environment) {
  return `superfunctions-${productId}-docs-${environment}`;
}

export function routeDefinition(productId, environment) {
  const product = docsProducts[productId];
  return {
    product: productId,
    zoneName: zoneNameFor(productId, environment),
    pattern: `${product.hosts[environment]}/docs*`,
    script: workerName(productId, environment),
  };
}

export function zoneNameFor(productId, environment) {
  return environment === "dev" ? devZoneName : docsProducts[productId].zoneName;
}

export function routesFor(environment, products) {
  return products.flatMap((productId) => {
    const route = routeDefinition(productId, environment);
    const product = docsProducts[productId];
    const aliases = product.routeAliases?.[environment] ?? [];
    return [
      route,
      ...aliases.map((host) => ({
        ...route,
        pattern: `${host}/docs*`,
      })),
    ];
  });
}

export function jsonArray(values) {
  return JSON.stringify([...new Set(values)]);
}
