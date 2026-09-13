# Hosted Hyperdrive qualification

Use a dedicated disposable PostgreSQL/pgvector service, never an existing product database. The Worker applies the distributed MemoryFn migrations and writes synthetic tenant rows. Provision a temporary Hyperdrive with query caching disabled and a TLS-capable origin. Cache-free reads are part of the lifecycle test contract.

Build from the validated package set using Node 22:

```sh
node scripts/sfns4/build-hosted-hyperdrive.mjs
```

The builder creates a fresh private temporary directory and returns `outfile` and `sha256` as JSON. Use that returned path and remove the directory after qualification.

Deploy that ES module through the Cloudflare API with `main_module: worker.mjs`, compatibility date `2026-09-13`, flag `nodejs_compat`, a `HYPERDRIVE` binding, and a random `CANARY_TOKEN` secret binding. Use a unique `sfns-4-` Worker name. Retain the uploaded bundle SHA256 and the exact Worker version and Hyperdrive IDs in qualification evidence. Never write a token or origin password to a repository file.

Invoke with a private mode-0600 token file:

```sh
node scripts/sfns4/run-hosted-hyperdrive.mjs "$SFNS4_WORKER_URL/run" "$SFNS4_TOKEN_FILE" .conduct/SFNS-4/hosted-hyperdrive.json
```

The runner checks unauthenticated denial, two sequential invocations and two concurrent invocations. Each invocation uses the actual MemoryFn Postgres adapter and the shared Drizzle adapter, applies migrations, checks transaction rollback, explicit tenant/all-tag filtering, competing revisions, stale-vector exclusion, rollback after induced relationship cleanup failure, idempotent forgetting, scrubbed tombstones, relation deletion, stale update rejection, injected client ownership and deletion after a new connection.

This is a synthetic lifecycle canary, not the complete Rex/DataFn application permission flow, long-running load test or provider/model qualification. Dispose the exact owned Worker, Hyperdrive and Railway test project after collecting evidence. Verify their absence and delete private local credential files. Preserve sanitized evidence and source scripts.

Reference: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/
