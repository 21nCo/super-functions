#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const packageDirs = [
  "mailfn/core",
  "mailfn/client",
  "mailfn/cloudflare",
  "mailfn/testing",
  "mailfn/cli",
  "mailfn/mcp",
  "mailfn/sendfn",
  "mailfn/facade",
  "mailfn/admin",
];

function run(file, args, cwd = root) {
  execFileSync(file, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
}

// MailFn's outbound integration is verified against the repository's SendFn
// package when present and otherwise against its declared published peer. Its
// CLI consumes the repository's ClIFn package, so build the local workspace
// dependencies before exercising MailFn packages.
run("npm", ["run", "build"], path.join(root, "clifn/core"));
run("npm", ["run", "build"], path.join(root, "packages/observability"));
run("npm", ["run", "build"], path.join(root, "packages/db"));
run("npm", ["run", "build"], path.join(root, "packages/http"));
run("npm", ["run", "build"], path.join(root, "mcpfn/core"));
run("npm", ["run", "build"], path.join(root, "packages/admin"));
const sendfnDirectory = path.join(root, "sendfn/typescript");
const hasLocalSendfn = existsSync(path.join(sendfnDirectory, "package.json"));
if (hasLocalSendfn) {
  run("npm", ["run", "build"], sendfnDirectory);
  run("npm", ["test"], sendfnDirectory);
} else {
  console.log(
    "MailFn release gate: local SendFn workspace is absent; validating the declared peer package through the packed consumer probe.",
  );
}

for (const directory of packageDirs) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, directory, "package.json"), "utf8"),
  );
  if (!manifest.publishConfig || manifest.publishConfig.access !== "public") {
    throw new Error(`${directory} is missing public publish metadata`);
  }
  run("npm", ["run", "clean"], path.join(root, directory));
  run("npm", ["run", "build"], path.join(root, directory));
  run("npm", ["test"], path.join(root, directory));
}

const mcpProbe = spawnSync(
  process.execPath,
  [path.join(root, "mailfn/mcp/dist/cli.js")],
  {
    cwd: root,
    encoding: "utf8",
    input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "mailfn-gate", version: "1" } } })}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 99 } })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`,
    env: {
      ...process.env,
      MAILFN_URL: "https://mailfn.invalid",
      MAILFN_TOKEN: "gate-token",
    },
  },
);
if (mcpProbe.status !== 0)
  throw new Error(`MailFn MCP executable probe failed: ${mcpProbe.stderr}`);
const mcpResponses = mcpProbe.stdout
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
if (
  mcpResponses.length !== 2 ||
  mcpResponses[0]?.result?.protocolVersion !== "2025-11-25" ||
  !Array.isArray(mcpResponses[1]?.result?.tools)
) {
  throw new Error(
    `MailFn MCP executable emitted an invalid stdio exchange: ${mcpProbe.stdout}`,
  );
}

const staging = mkdtempSync(path.join(tmpdir(), "mailfn-release-"));
try {
  const tarballs = [];
  for (const directory of packageDirs) {
    const output = execFileSync("npm", ["pack", "--json"], {
      cwd: path.join(root, directory),
      encoding: "utf8",
    });
    const packed = JSON.parse(output);
    tarballs.push(path.join(root, directory, packed[0].filename));
  }
  run("npm", ["init", "-y"], staging);
  run(
    "npm",
    ["install", "--ignore-scripts", "--package-lock=false", ...tarballs],
    staging,
  );
  run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('mailfn'); await import('@mailfn/core'); await import('@mailfn/client'); await import('@mailfn/cloudflare'); await import('@mailfn/testing'); await import('@mailfn/cli'); await import('@mailfn/mcp'); await import('@mailfn/sendfn'); await import('@mailfn/admin');",
    ],
    staging,
  );
  for (const fixture of ["router-cloudflare.ts", "framework-neutral.ts"]) {
    copyFileSync(
      path.join(root, "mailfn/consumers", fixture),
      path.join(staging, fixture),
    );
  }
  run(
    path.join(root, "node_modules/.bin/tsc"),
    [
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--lib",
      "ES2022,DOM",
      "router-cloudflare.ts",
      "framework-neutral.ts",
    ],
    staging,
  );
  console.log("MailFn release gate passed");
} finally {
  rmSync(staging, { recursive: true, force: true });
  for (const directory of packageDirs) {
    const manifest = JSON.parse(
      readFileSync(path.join(root, directory, "package.json"), "utf8"),
    );
    rmSync(
      path.join(
        root,
        directory,
        `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`,
      ),
      { force: true },
    );
  }
}
