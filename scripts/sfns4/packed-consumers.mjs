import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import glob from "fast-glob";
const root = process.cwd();
const uiRequire = createRequire(resolve("uifn/svelte/package.json"));
const compilerRequire = createRequire(
  uiRequire.resolve("@sveltejs/vite-plugin-svelte"),
);
const svelteVersion = compilerRequire("svelte/package.json").version;
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const packages = new Map(
  (
    await glob(manifest.workspaces.map((pattern) => `${pattern}/package.json`))
  ).map((path) => {
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    return [pkg.name, { path: resolve(path, ".."), pkg }];
  }),
);
const selected = [
  "plugfn",
  "@plugfn/providers",
  "langfn",
  "@memoryfn/core",
  "@clifn/core",
  "sendfn",
  "@secfn/server",
  "@secfn/runtime",
  "@filefn/server",
  "@datafn/server",
  "authfn",
  "@uifn/svelte",
];
const closure = new Set();
function visit(name) {
  if (closure.has(name) || !packages.has(name)) return;
  closure.add(name);
  const pkg = packages.get(name).pkg;
  for (const dep of Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
  }))
    visit(dep);
}
selected.forEach(visit);
const temporary = mkdtempSync(join(tmpdir(), "sfns4-packed-"));
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
try {
  run("npm", [
    "exec",
    "turbo",
    "run",
    "build",
    "--",
    ...selected.map((name) => `--filter=${name}...`),
  ]);
  const integrity = [];
  const tarballs = [];
  for (const name of closure) {
    const pkg = packages.get(name);
    const result = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
        pkg.path,
      ),
    )[0];
    const path = join(temporary, result.filename);
    tarballs.push(path);
    integrity.push({
      name,
      version: pkg.pkg.version,
      integrity: result.integrity,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    });
  }
  writeFileSync(
    join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { svelte: svelteVersion },
    }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs],
    temporary,
  );
  run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    const plug = await import('plugfn');
    const providers = await import('@plugfn/providers/google-docs');
    const lang = await import('langfn/models');
    const memory = await import('@memoryfn/core');
    const cli = await import('@clifn/core');
    const sec = await import('@secfn/server');
    const secCore = await import('@secfn/core');
    const fs = await import('node:fs');
    const secMetadata = JSON.parse(fs.readFileSync('node_modules/@secfn/server/package.json', 'utf8'));
    const secRuntimeMetadata = JSON.parse(fs.readFileSync('node_modules/@secfn/runtime/package.json', 'utf8'));
    if (secMetadata.superfunctions.schemaVersion !== secCore.SECFN_SCHEMA_VERSION) throw new Error('Packed SecFn schema metadata is stale');
    if (Object.hasOwn(secMetadata.exports['.'], 'require') || Object.hasOwn(secMetadata.exports['./audit'], 'require') || Object.hasOwn(secRuntimeMetadata.exports['.'], 'require')) throw new Error('Packed SecFn metadata advertises unsupported CommonJS');
    const file = await import('@filefn/server');
    const data = await import('@datafn/server');
    const auth = await import('authfn');
    const send = await import('sendfn/adapters/connected-mailbox');
    if (!sec.createSecFnServer || !Object.keys(file).length || !Object.keys(data).length || !Object.keys(auth).length || !send.connectedMailboxAdapter) throw new Error('Platform export missing');
    const pg = await import('@memoryfn/core/storage/pg');
    if (!pg.PostgresAdapter || !pg.memories) throw new Error('Postgres schema export missing');
    const injectedPg = new pg.PostgresAdapter({});
    if (injectedPg.embeddingDimensions !== 1536) throw new Error('Postgres dimension capability missing');
    let rejectedDimensions = false;
    try { memory.memoryfn({ storage: { kind: 'adapter', adapter: injectedPg }, embedder: { provider: 'openai', apiKey: 'fixture', dims: 768 } }); }
    catch (error) { rejectedDimensions = error.message === 'MEMORY_PG_EMBEDDING_DIMENSION_MUST_BE_1536'; }
    if (!rejectedDimensions) throw new Error('Bundled subpath adapter dimensions were not enforced');
    if (!plug.ExecutionCoordinator || !providers.googleDocsProvider.actions['documents.get'] || !lang.GoogleChatModel || !memory.MemoryStorageAdapter || !cli.createCredentialStore) throw new Error('Packed export missing');
    const store = new memory.MemoryStorageAdapter();
    const m = memory.memoryfn({ storage: { kind: 'adapter', adapter: store } });
    const added = await m.add({ tenantId: 'test', containerTags: [], content: 'packed' });
    await m.forget({ tenantId: 'test', containerTags: [], id: added.memories[0].id });
    console.log('packed consumer import and lifecycle passed');
  `,
    ],
    temporary,
  );
  run(
    process.execPath,
    [
      "--input-type=commonjs",
      "-e",
      `
    const memory = require('@memoryfn/core');
    const http = require('@memoryfn/core/http');
    const mcp = require('@memoryfn/core/mcp');
    const pg = require('@memoryfn/core/storage/pg');
    if (!memory.MemoryStorageAdapter || !http.createMemoryRouter || !mcp.MemoryMCP || !pg.PostgresAdapter || !pg.memories) throw new Error('Packed CommonJS MemoryFn export missing');
    console.log('packed CommonJS MemoryFn exports passed');
  `,
    ],
    temporary,
  );
  const { verifyPackedUI } = await import("./packed-ui.mjs");
  await verifyPackedUI(temporary);
  const artifactSet = createHash('sha256').update(JSON.stringify(integrity)).digest('hex');
  const artifactDirectory = join('.conduct', 'SFNS-4', 'artifacts', artifactSet.slice(0, 16));
  mkdirSync(artifactDirectory, { recursive: true });
  for (let i = 0; i < tarballs.length; i++) {
    const destination = join(artifactDirectory, tarballs[i].split('/').at(-1));
    if (existsSync(destination) && createHash('sha256').update(readFileSync(destination)).digest('hex') !== integrity[i].sha256) throw new Error('Existing artifact integrity conflict');
    copyFileSync(tarballs[i], destination);
  }
  console.log(
    JSON.stringify(
      {
        gate: "SFNS-4 packed consumers",
        ok: true,
        svelteVersion,
        artifactSet,
        artifactDirectory,
        packages: integrity,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
