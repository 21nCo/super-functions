#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import { authfn, authFnPlugins } from "authfn";
import { authFnApiKeyPlugin } from "@authfn/api-keys";
import { authFnEmailOtpPlugin } from "@authfn/email-otp";
import { authFnMultiRegionPlugin } from "@authfn/multi-region";
import { authFnNativeHandoffPlugin } from "@authfn/native-handoff";
import { authFnPasswordPlugin } from "@authfn/password";
import { authFnSocialOAuthPlugin } from "@authfn/social-oauth";
import { authFnTwoFactorPlugin } from "@authfn/two-factor";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "content", "api");
const outFile = join(outDir, "authfn.json");

const authApp = authfn({
  namespace: "authfn",
  openApi: {
    title: "AuthFn API",
    version: "0.1.1",
  },
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
    authFnSocialOAuthPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin(),
    authFnMultiRegionPlugin(),
    authFnNativeHandoffPlugin(),
  ),
});

const auth = authApp.createServer({
  database: memoryAdapter({ debug: false }),
  pluginRuntime: {
    emailOtp: {
      delivery: { async send() { return { sent: true }; } },
    },
    socialOAuth: {
      providers: {
        google: { clientId: "google-client-id", clientSecret: "google-client-secret" },
        github: { clientId: "github-client-id", clientSecret: "github-client-secret" },
        apple: { clientId: "apple-client-id", clientSecret: "apple-client-secret" },
      },
    },
  },
});

const document = auth.openApi?.();
if (!document) {
  throw new Error("openApi() did not return a document");
}

mkdirSync(outDir, { recursive: true });

const annotated = {
  ...document,
  info: {
    ...(document.info ?? {}),
    title: "AuthFn API",
    description:
      "Generated from authfn with every bundled plugin enabled. The shape of " +
      "your deployment's OpenAPI document depends on the plugins you actually mount.",
  },
};

const frontmatter = `---\ntitle: HTTP API Reference\ndescription: Auto-generated OpenAPI surface for an authfn server with every bundled plugin enabled.\n---\n`;

writeFileSync(outFile, JSON.stringify(annotated, null, 2) + "\n", "utf8");

const operationCount = Object.values(annotated.paths ?? {}).reduce(
  (count, methods) => count + Object.keys(methods ?? {}).length,
  0,
);

console.log(
  `Wrote ${outFile} (${Object.keys(annotated.paths ?? {}).length} paths, ${operationCount} operations)`,
);

void frontmatter;
