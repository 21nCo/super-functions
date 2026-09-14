import { describe, expect, it } from "vitest";
import { createSecFnServer } from "../index.js";
import { MemoryAdapter } from "./memory-adapter.js";

function createServer(options: { allowAdmin?: boolean; rateLimit?: boolean; namespaceScoped?: boolean; noTenant?: boolean } = {}) {
  const db = new MemoryAdapter();
  const secfn = createSecFnServer({
    db,
    encryption: { masterKey: "test-master-key", keyId: "test" },
    context: (request) => ({
      actorId: request.headers.get("x-actor-id") ?? undefined,
      tenantId: options.noTenant ? undefined : request.headers.get("x-tenant-id") ?? "tenant-a",
      namespace: options.namespaceScoped === false ? undefined : request.headers.get("x-namespace") ?? "workspace-a",
      ip: request.headers.get("x-forwarded-for") ?? "127.0.0.1",
      userAgent: request.headers.get("user-agent") ?? undefined,
      requestId: request.headers.get("x-request-id") ?? undefined,
    }),
    authorize: async () => options.allowAdmin ?? true,
    rateLimit: options.rateLimit
      ? {
        enabled: true,
        persistence: db,
        singleProcess: true,
        windowMs: 60_000,
        limits: { perIP: 1, perUser: 1, perEndpoint: 1 },
      }
      : undefined,
  });
  return { db, secfn };
}

describe("createSecFnServer", () => {
  it("requires admin authorization and returns the stable error envelope", async () => {
    const { secfn, db } = createServer({ allowAdmin: false });

    const response = await secfn.router.handle(new Request("https://app.test/secfn/admin/secrets"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "SECFN_FORBIDDEN" },
    });
    expect(db.dump("secfn_audit_events")).toHaveLength(1);
    expect(db.dump("secfn_audit_events")[0]).toMatchObject({
      type: "permission_denied",
      resource: "admin:secrets:list",
    });
  });

  it("creates, rotates, lists, and reads secrets without returning admin plaintext", async () => {
    const { secfn, db } = createServer();

    const created = await secfn.router.handle(new Request("https://app.test/secfn/admin/secrets", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ key: "OPENAI_API_KEY", value: "sk-test-secret" }),
    }));
    const createdBody = await created.json();
    expect(created.status).toBe(201);
    expect(createdBody.data.key).toBe("OPENAI_API_KEY");
    expect(JSON.stringify(createdBody)).not.toContain("sk-test-secret");

    const rotated = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secrets/${createdBody.data.id}/rotate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ value: "sk-rotated-secret" }),
    }));
    const rotatedBody = await rotated.json();
    expect(rotatedBody.data.currentVersion).toBe(2);

    const list = await secfn.router.handle(new Request("https://app.test/secfn/admin/secrets", {
      headers: { "x-actor-id": "admin" },
    }));
    const listBody = await list.json();
    expect(listBody.data).toHaveLength(1);
    expect(JSON.stringify(listBody)).not.toContain("sk-rotated-secret");

    expect(db.dump("secfn_secret_versions")).toHaveLength(2);
    expect(db.dump("secfn_audit_events").filter((event) => event.action === "rotate")).toHaveLength(1);
  });

  it("reveals secrets only after explicit admin confirmation and audits the access", async () => {
    const { secfn, db } = createServer();

    const created = await secfn.router.handle(new Request("https://app.test/secfn/admin/secrets?environment=production", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ key: "OPENAI_API_KEY", value: "sk-test-secret" }),
    }));
    const createdBody = await created.json();

    const denied = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secrets/${createdBody.data.id}/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ confirm: false }),
    }));
    expect(denied.status).toBe(403);

    const revealed = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secrets/${createdBody.data.id}/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ confirm: true }),
    }));
    const revealedBody = await revealed.json();
    expect(revealed.status).toBe(200);
    expect(revealedBody.data).toMatchObject({
      key: "OPENAI_API_KEY",
      value: "sk-test-secret",
      environment: "production",
      version: 1,
    });
    expect(db.dump("secfn_audit_events").filter((event) => event.action === "reveal")).toHaveLength(1);
  });

  it("manages secret set members and deletes sets with their memberships", async () => {
    const { secfn, db } = createServer();
    const first = await secfn.vault.createSecret({
      key: "DATABASE_URL",
      value: "postgres://secret",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      createdBy: "admin",
    });
    const second = await secfn.vault.createSecret({
      key: "REDIS_URL",
      value: "redis://secret",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      createdBy: "admin",
    });

    const setResponse = await secfn.router.handle(new Request("https://app.test/secfn/admin/secret-sets?environment=production", {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ name: "app-production", members: [{ secretId: first.id, alias: "DATABASE_URL" }] }),
    }));
    const setBody = await setResponse.json();
    expect(setResponse.status).toBe(201);

    const addResponse = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secret-sets/${setBody.data.id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ secretId: second.id, alias: "CACHE_URL" }),
    }));
    const addBody = await addResponse.json();
    expect(addResponse.status).toBe(201);

    const updateResponse = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secret-sets/${setBody.data.id}/members/${addBody.data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-actor-id": "admin" },
      body: JSON.stringify({ alias: "REDIS_URL" }),
    }));
    const updateBody = await updateResponse.json();
    expect(updateBody.data.alias).toBe("REDIS_URL");

    const membersResponse = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secret-sets/${setBody.data.id}/members`, {
      headers: { "x-actor-id": "admin" },
    }));
    const membersBody = await membersResponse.json();
    expect(membersBody.data).toHaveLength(2);

    const removeResponse = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secret-sets/${setBody.data.id}/members/${addBody.data.id}`, {
      method: "DELETE",
      headers: { "x-actor-id": "admin" },
    }));
    expect(removeResponse.status).toBe(200);

    const deleteResponse = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secret-sets/${setBody.data.id}`, {
      method: "DELETE",
      headers: { "x-actor-id": "admin" },
    }));
    expect(deleteResponse.status).toBe(200);
    expect(db.dump("secfn_secret_sets")).toHaveLength(0);
    expect(db.dump("secfn_secret_set_members")).toHaveLength(0);
  });

  it("enforces runtime token tenant, environment, and secret scopes", async () => {
    const { secfn } = createServer();
    const secret = await secfn.vault.createSecret({
      key: "STRIPE_SECRET_KEY",
      value: "sk_live_runtime",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      createdBy: "admin",
    });
    const token = await secfn.vault.createServiceToken({
      name: "worker",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      scopes: ["secret:STRIPE_SECRET_KEY"],
      createdBy: "admin",
    });

    const denied = await secfn.router.handle(new Request("https://app.test/secfn/runtime/secrets/OTHER?environment=production", {
      headers: {
        authorization: `Bearer ${token.token}`,
        "x-tenant-id": "tenant-a",
        "x-namespace": "workspace-a",
      },
    }));
    expect(denied.status).toBe(403);

    const allowed = await secfn.router.handle(new Request(`https://app.test/secfn/runtime/secrets/${secret.key}?environment=production`, {
      headers: {
        authorization: `Bearer ${token.token}`,
        "x-tenant-id": "tenant-a",
        "x-namespace": "workspace-a",
      },
    }));
    const body = await allowed.json();
    expect(allowed.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: { key: "STRIPE_SECRET_KEY", value: "sk_live_runtime", version: 1 },
    });
  });

  it("resolves set-scoped runtime tokens without granting direct secret reads", async () => {
    const { secfn } = createServer();
    const secret = await secfn.vault.createSecret({
      key: "DATABASE_URL",
      value: "postgres://secret",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      createdBy: "admin",
    });
    await secfn.vault.createSecretSet({
      name: "nucleus-production",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      createdBy: "admin",
      members: [{ secretId: secret.id, alias: "DATABASE_URL" }],
    });
    const token = await secfn.vault.createServiceToken({
      name: "set-worker",
      tenantId: "tenant-a",
      namespace: "workspace-a",
      environment: "production",
      scopes: ["set:nucleus-production"],
      createdBy: "admin",
    });

    const direct = await secfn.router.handle(new Request("https://app.test/secfn/runtime/secrets/DATABASE_URL?environment=production", {
      headers: {
        authorization: `Bearer ${token.token}`,
        "x-tenant-id": "tenant-a",
        "x-namespace": "workspace-a",
      },
    }));
    expect(direct.status).toBe(403);

    const set = await secfn.router.handle(new Request("https://app.test/secfn/runtime/secret-sets/nucleus-production/resolve?environment=production", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.token}`,
        "x-tenant-id": "tenant-a",
        "x-namespace": "workspace-a",
      },
    }));
    const body = await set.json();
    expect(set.status).toBe(200);
    expect(body.data.secrets).toEqual({ DATABASE_URL: "postgres://secret" });
  });

  it("uses shared middleware rate limiting and writes audit events on denial", async () => {
    const { secfn, db } = createServer({ rateLimit: true });

    const first = await secfn.router.handle(new Request("https://app.test/secfn/admin/secrets", {
      headers: { "x-actor-id": "admin", "x-forwarded-for": "10.0.0.5" },
    }));
    expect(first.status).toBe(200);

    const second = await secfn.router.handle(new Request("https://app.test/secfn/admin/secrets", {
      headers: { "x-actor-id": "admin", "x-forwarded-for": "10.0.0.5" },
    }));
    expect(second.status).toBe(429);
    expect(db.dump("secfn_audit_events").some((event) => event.type === "rate_limit_exceeded")).toBe(true);
    expect(db.dump("rate_limits").length).toBeGreaterThan(0);
  });
});

it('denies admin access when no authorizer is supplied', async () => {
  const secfn = createSecFnServer({ db: new MemoryAdapter(), encryption: { masterKey: 'test-key' } });
  const response = await secfn.router.handle(new Request('https://app.test/secfn/admin/secrets'));
  expect(response.status).toBe(403);
});
it('prevents tenant context from reading or rotating another tenants secret by ID', async () => {
  const { secfn } = createServer();
  const created = await secfn.router.handle(new Request('https://app.test/secfn/admin/secrets', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant-b' }, body: JSON.stringify({ key: 'SECRET', value: 'private' }) }));
  const { data } = await created.json();
  for (const suffix of ['', '/rotate', '/reveal', '/revoke']) {
    const result = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secrets/${data.id}${suffix}`, { method: suffix ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-tenant-id': 'tenant-a' }, ...(suffix ? { body: JSON.stringify({ value: 'overwrite', confirm: true }) } : {}) }));
    expect(result.status).toBe(403);
  }
  const query = await secfn.router.handle(new Request('https://app.test/secfn/admin/namespaces?tenantId=tenant-b', { headers: { 'x-tenant-id': 'tenant-a' } }));
  expect(query.status).toBe(403);
});
it('passes requested token scopes to the authorizer without consuming the handler body', async () => {
  let inspected: unknown;
  const secfn = createSecFnServer({ db: new MemoryAdapter(), encryption: { masterKey: 'test-key' }, context: { tenantId: 't' },
    authorize: async (_ctx, action, payload) => { inspected = await (payload as { request: Request }).request.json(); return action !== 'service-tokens:create'; } });
  const response = await secfn.router.handle(new Request('https://app.test/secfn/admin/service-tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'broad', scopes: ['*'] }) }));
  expect(inspected).toEqual({ name: 'broad', scopes: ['*'] }); expect(response.status).toBe(403);
});

it("enforces runtime scope on omitted environments and every set member", async () => {
  const { secfn, db } = createServer();
  const scope = { tenantId: "tenant-a", namespace: "workspace-a", createdBy: "admin" };
  const dev = await secfn.vault.createSecret({ ...scope, environment: "development", key: "DEV", value: "dev-only" });
  const token = await secfn.vault.createServiceToken({ ...scope, name: "prod", environment: "production", scopes: ["secret:*", "set:app"] });
  await expect(secfn.vault.verifyRuntimeToken(token.token, scope)).rejects.toThrow("environment mismatch");
  const verified = await secfn.vault.verifyRuntimeToken(token.token, { ...scope, environment: "production" });
  await expect(secfn.vault.readRuntimeSecret("DEV", verified, scope)).rejects.toThrow("scope mismatch");
  await secfn.vault.createSecretSet({ ...scope, name: "app", members: [{ secretId: dev.id }] });
  await expect(secfn.vault.resolveRuntimeSet("app", verified, { ...scope, environment: "production" })).rejects.toThrow("scope mismatch");
  expect(db.dump("secfn_audit_events").filter(e => e.action === "read")).toHaveLength(0);
});

it("looks up tokens beyond 1000 rows and cleans up revoked secret history", async () => {
  const { secfn, db } = createServer();
  for (let i = 0; i < 1001; i++) await db.create({ model: "secfn_service_tokens", data: { id: `noise-${i}`, tokenHash: `noise-${i}` } });
  const scope = { tenantId: "tenant-a", namespace: "workspace-a", createdBy: "admin" };
  const token = await secfn.vault.createServiceToken({ ...scope, name: "last", scopes: ["secret:KEY"] });
  await expect(secfn.vault.verifyRuntimeToken(token.token, scope)).resolves.toBeDefined();
  const secret = await secfn.vault.createSecret({ ...scope, key: "KEY", value: "old" });
  await secfn.vault.createSecretSet({ ...scope, name: "app", members: [{ secretId: secret.id }] });
  await secfn.vault.revokeSecret(secret.id, "admin");
  await expect(secfn.vault.createSecret({ ...scope, key: "KEY", value: "new" })).rejects.toThrow();
  await secfn.vault.deleteSecret(secret.id, "admin");
  expect(db.dump("secfn_secret_versions")).toHaveLength(0);
  expect(db.dump("secfn_secret_set_members")).toHaveLength(0);
  await expect(secfn.vault.createSecret({ ...scope, key: "KEY", value: "new" })).resolves.toBeDefined();
});

it("rejects namespace IDs belonging to another tenant", async () => {
  const { secfn } = createServer();
  const namespace = await secfn.vault.createNamespace({ tenantId: "other", slug: "private", createdBy: "admin" });
  await expect(secfn.vault.createEnvironment({ tenantId: "tenant-a", namespaceId: namespace.id, name: "production", createdBy: "admin" })).rejects.toThrow("Namespace not found");
});

it("binds ID-issued tokens to canonical tenant, namespace and environment", async () => {
  const { secfn } = createServer();
  const ns = await secfn.vault.createNamespace({ tenantId: "tenant-a", slug: "canonical", label: "Display Name", createdBy: "admin" });
  const env = await secfn.vault.createEnvironment({ tenantId: "tenant-a", namespaceId: ns.id, name: "production", createdBy: "admin" });
  const secret = await secfn.vault.createSecret({ tenantId: "tenant-a", namespaceId: ns.id, environmentId: env.id, key: "KEY", value: "private", createdBy: "admin" });
  const token = await secfn.vault.createServiceToken({ tenantId: "tenant-a", namespaceId: ns.id, environmentId: env.id, name: "by-id", scopes: ["secret:KEY", "set:app"], createdBy: "admin" });
  expect(token.record).toMatchObject({ tenantId: "tenant-a", namespace: "canonical", environment: "production" });
  const scope = { tenantId: "tenant-a", namespace: "canonical", environment: "production" };
  const verified = await secfn.vault.verifyRuntimeToken(token.token, scope);
  expect((await secfn.vault.readRuntimeSecret("KEY", verified, scope)).value).toBe("private");
  await secfn.vault.createSecretSet({ tenantId: "tenant-a", namespaceId: ns.id, name: "app", members: [{ secretId: secret.id }], createdBy: "admin" });
  expect((await secfn.vault.resolveRuntimeSet("app", verified, scope)).secrets).toEqual({ KEY: "private" });
  const ids = { tenantId: "tenant-a", namespaceId: ns.id, environmentId: env.id };
  const byIds = await secfn.vault.verifyRuntimeToken(token.token, ids);
  expect((await secfn.vault.readRuntimeSecret("KEY", byIds, ids)).value).toBe("private");
  expect((await secfn.vault.resolveRuntimeSet("app", byIds, ids)).secrets).toEqual({ KEY: "private" });
  for (const path of ["secrets/KEY", "secret-sets/app/resolve"]) {
    const response = await secfn.router.handle(new Request(`https://app.test/secfn/runtime/${path}?namespaceId=${ns.id}&environmentId=${env.id}`, { method: path.endsWith("resolve") ? "POST" : "GET", headers: { authorization: `Bearer ${token.token}`, "x-namespace": "canonical" } }));
    expect(response.status).toBe(200);
  }
  const foreign = await secfn.vault.createNamespace({ tenantId: "other", slug: "foreign", createdBy: "admin" });
  await expect(secfn.vault.verifyRuntimeToken(token.token, { ...ids, namespaceId: foreign.id })).rejects.toThrow();
  const wrongEnv = await secfn.vault.createEnvironment({ tenantId: "tenant-a", namespaceId: ns.id, name: "staging", createdBy: "admin" });
  await expect(secfn.vault.verifyRuntimeToken(token.token, { ...ids, environmentId: wrongEnv.id })).rejects.toThrow();
  await expect(secfn.vault.verifyRuntimeToken(token.token, { ...scope, environment: "development" })).rejects.toThrow();
  await expect(secfn.vault.createServiceToken({ tenantId: "other", namespaceId: ns.id, name: "bad", scopes: ["*"], createdBy: "admin" })).rejects.toThrow();
});

it("rejects conflicting scope representations and derives an environment's parent", async () => {
  const { secfn } = createServer();
  const ns = await secfn.vault.createNamespace({ tenantId: "tenant-a", slug: "canonical", createdBy: "admin" });
  const env = await secfn.vault.createEnvironment({ tenantId: "tenant-a", namespaceId: ns.id, name: "production", createdBy: "admin" });
  const scope = { tenantId: "tenant-a", namespaceId: ns.id, environmentId: env.id };
  await secfn.vault.createSecret({ ...scope, key: "KEY", value: "private", createdBy: "admin" });
  const token = await secfn.vault.createServiceToken({ ...scope, name: "test", scopes: ["*"], createdBy: "admin" });
  const onlyEnv = { tenantId: "tenant-a", environmentId: env.id };
  const verified = await secfn.vault.verifyRuntimeToken(token.token, onlyEnv);
  expect((await secfn.vault.readRuntimeSecret("KEY", verified, onlyEnv)).value).toBe("private");
  for (const conflict of [{ namespace: "wrong" }, { environment: "development" }]) {
    await expect(secfn.vault.verifyRuntimeToken(token.token, { ...scope, ...conflict })).rejects.toThrow("mismatch");
    await expect(secfn.vault.readRuntimeSecret("KEY", verified, { ...scope, ...conflict })).rejects.toThrow("mismatch");
  }
  const response = await secfn.router.handle(new Request(`https://app.test/secfn/runtime/secrets/KEY?namespaceId=${ns.id}&environmentId=${env.id}`, { headers: { authorization: `Bearer ${token.token}` } }));
  expect(response.status).toBe(400);
});

it("validates all secret-set members before writing the set or any membership", async () => {
  const { secfn, db } = createServer();
  const scope = { tenantId: "tenant-a", namespace: "workspace-a", createdBy: "admin" };
  const one = await secfn.vault.createSecret({ ...scope, key: "ONE", value: "one" });
  const other = await secfn.vault.createSecret({ ...scope, namespace: "other", key: "OTHER", value: "other" });
  for (const members of [
    [{ secretId: one.id }, { secretId: "missing" }],
    [{ secretId: one.id }, { secretId: other.id }],
    [{ secretId: one.id }, { secretId: one.id, alias: " ONE " }]
  ]) {
    await expect(secfn.vault.createSecretSet({ ...scope, name: "retryable", members })).rejects.toThrow();
    expect(db.dump("secfn_secret_sets")).toHaveLength(0);
    expect(db.dump("secfn_secret_set_members")).toHaveLength(0);
  }
  await expect(secfn.vault.createSecretSet({ ...scope, name: "retryable", members: [{ secretId: one.id }] })).resolves.toMatchObject({ name: "retryable" });
});

it("derives secret-set tenant ownership from a namespace ID", async () => {
  const { secfn } = createServer();
  const ns = await secfn.vault.createNamespace({ tenantId: "tenant-a", slug: "owned", createdBy: "admin" });
  const secret = await secfn.vault.createSecret({ tenantId: "tenant-a", namespaceId: ns.id, key: "KEY", value: "value", createdBy: "admin" });
  const input = { namespaceId: ns.id, name: "by-id", members: [{ secretId: secret.id }], createdBy: "admin" };
  const set = await secfn.vault.createSecretSet(input);
  expect(set.tenantId).toBe("tenant-a");
  expect(await secfn.vault.listSecretSetMembers(set.id)).toHaveLength(1);
  await expect(secfn.vault.createSecretSet(input)).rejects.toThrow("already exists");
  await expect(secfn.vault.createSecretSet({ ...input, tenantId: "other", name: "invalid" })).rejects.toThrow();
});

it("records scan-run ownership and isolates tenant lists", async () => {
  const { secfn } = createServer({ namespaceScoped: false });
  expect(secfn.getSchema().find(table => table.modelName === "secfn_scan_runs")?.fields.tenantId).toMatchObject({ fieldName: "tenant_id" });
  for (const tenantId of ["tenant-a", "tenant-b"]) await secfn.vault.recordScanRun({ tenantId, target: tenantId, status: "completed", findingCount: 0, startedAt: new Date().toISOString() });
  const response = await secfn.router.handle(new Request("https://app.test/secfn/admin/scan-runs"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(JSON.stringify(body)).toContain("tenant-a");
  expect(JSON.stringify(body)).not.toContain("tenant-b");
});

it("rolls back failed rotation and permits retry without an orphan version", async () => {
  const { secfn, db } = createServer();
  const secret = await secfn.vault.createSecret({ tenantId: "tenant-a", namespace: "workspace-a", key: "ROLLBACK", value: "old", createdBy: "admin" });
  const update = db.update.bind(db);
  let fail = true;
  db.update = async (params: any) => {
    if (params.model === "secfn_secrets" && fail) { fail = false; throw new Error("injected update failure"); }
    return update(params);
  };
  await expect(secfn.vault.rotateSecret(secret.id, { value: "new", actorId: "admin" })).rejects.toThrow("injected");
  expect(db.dump("secfn_secret_versions")).toHaveLength(1);
  expect((await secfn.vault.getSecret(secret.id)).currentVersion).toBe(1);
  expect((await secfn.vault.rotateSecret(secret.id, { value: "new", actorId: "admin" })).currentVersion).toBe(2);
  expect(db.dump("secfn_secret_versions")).toHaveLength(2);
  db.capabilities.transactions.supported = false;
  await expect(secfn.vault.rotateSecret(secret.id, { value: "never", actorId: "admin" })).rejects.toThrow("transactional storage");
  expect(db.dump("secfn_secret_versions")).toHaveLength(2);
});


it("rolls back initial secret creation when its version fails and allows retry", async () => {
  const { secfn, db } = createServer();
  const create = db.create.bind(db);
  let fail = true;
  db.create = async (params: any) => {
    if (params.model === "secfn_secret_versions" && fail) { fail = false; throw new Error("version insert failed"); }
    return create(params);
  };
  const input = { tenantId: "tenant-a", namespace: "workspace-a", key: "INITIAL", value: "value", createdBy: "admin" };
  await expect(secfn.vault.createSecret(input)).rejects.toThrow("version insert failed");
  expect(db.dump("secfn_secrets")).toHaveLength(0);
  expect(db.dump("secfn_secret_versions")).toHaveLength(0);
  await secfn.vault.createSecret(input);
  expect(db.dump("secfn_secrets")).toHaveLength(1);
  expect(db.dump("secfn_secret_versions")).toHaveLength(1);
});

it('rejects same-tenant foreign-namespace secret IDs', async () => {
  const { secfn } = createServer();
  const secret = await secfn.vault.createSecret({ tenantId: 'tenant-a', namespace: 'foreign', key: 'PRIVATE', value: 'hidden', createdBy: 'admin' });
  const response = await secfn.router.handle(new Request(`https://app.test/secfn/admin/secrets/${secret.id}`));
  expect(response.status).toBe(403);
});

it('keeps trusted namespaces on collections and permits owned token revocation', async () => {
  const { secfn } = createServer();
  for (const namespace of ['workspace-a', 'foreign']) {
    await secfn.vault.createSecret({ tenantId: 'tenant-a', namespace, key: 'KEY', value: 'value', createdBy: 'admin' });
  }
  for (const path of ['secrets', 'secret-sets', 'environments', 'audit-events']) {
    const denied = await secfn.router.handle(new Request(`https://app.test/secfn/admin/${path}?namespace=foreign`));
    expect(denied.status).toBe(403);
    const own = await secfn.router.handle(new Request(`https://app.test/secfn/admin/${path}`));
    expect(own.status).toBe(200);
    expect(await own.text()).not.toContain('foreign');
  }
  expect((await secfn.router.handle(new Request('https://app.test/secfn/admin/scan-runs'))).status).toBe(403);
  for (const namespace of ['workspace-a', 'foreign']) {
    const { record } = await secfn.vault.createServiceToken({ tenantId: 'tenant-a', namespace, name: 'token', scopes: ['*'], createdBy: 'admin' });
    const response = await secfn.router.handle(new Request(`https://app.test/secfn/admin/service-tokens/${record.id}/revoke`, { method: 'POST' }));
    expect(response.status).toBe(namespace === 'workspace-a' ? 200 : 403);
  }
});

it('derives environment ownership and rejects body scope overrides', async () => {
  const { secfn } = createServer();
  const foreign = await secfn.vault.createNamespace({ tenantId: 'tenant-a', slug: 'foreign', createdBy: 'admin' });
  for (const body of [{ name: 'prod', namespace: 'foreign' }, { name: 'prod', namespaceId: foreign.id }]) {
    const response = await secfn.router.handle(new Request('https://app.test/secfn/admin/environments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect(response.status).toBe(403);
  }
  const response = await secfn.router.handle(new Request('https://app.test/secfn/admin/environments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'production' }) }));
  expect(response.status).toBe(201);
  const body = await response.json();
  const owned = await secfn.vault.listNamespaces({ tenantId: 'tenant-a' });
  expect(body.data.namespaceId).toBe(owned.find(row => row.slug === 'workspace-a')?.id);
});
it('requires tenant identity for namespace-scoped administration', async () => {
  const { secfn } = createServer({ noTenant: true });
  const token = await secfn.vault.createServiceToken({ tenantId: 'tenant-b', namespace: 'workspace-a', name: 'foreign', scopes: ['*'], createdBy: 'admin' });
  const response = await secfn.router.handle(new Request(`https://app.test/secfn/admin/service-tokens/${token.record.id}/revoke`, { method: 'POST' }));
  expect(response.status).toBe(403);
});

it('paginates beyond 1000 rows without dropping page boundaries', async () => {
  const { secfn, db } = createServer({ namespaceScoped: false });
  for (let i = 0; i < 1005; i++) await db.create({ model: 'secfn_secrets', data: { id: String(i).padStart(5, '0'), tenantId: 'tenant-a', key: `KEY${i}`, tags: [], updatedAt: i < 500 ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z', currentVersion: 1 } });
  const seen: string[] = []; let cursor: string | undefined;
  do {
    const page = await secfn.vault.listSecrets({ tenantId: 'tenant-a', limit: 100, cursor });
    seen.push(...page.items.map(row => row.id)); cursor = page.nextCursor;
  } while (cursor);
  expect(seen).toHaveLength(1005); expect(new Set(seen).size).toBe(1005);
});
it('rejects provider-derived and query namespaces without a tenant', async () => {
  const secfn = createSecFnServer({ db: new MemoryAdapter(), encryption: { masterKey: 'test' }, context: {}, namespaceProvider: () => 'shared', authorize: async () => true });
  expect((await secfn.router.handle(new Request('https://app.test/secfn/admin/secrets'))).status).toBe(403);
  expect((await secfn.router.handle(new Request('https://app.test/secfn/admin/secrets?namespace=shared'))).status).toBe(403);
});

it('prevents runtime query namespace from overriding namespaceProvider', async () => {
  const secfn = createSecFnServer({ db: new MemoryAdapter(), encryption: { masterKey: 'test' }, context: { tenantId: 'tenant-a' }, namespaceProvider: () => 'workspace-a', authorize: async () => true });
  const token = await secfn.vault.createServiceToken({ tenantId: 'tenant-a', namespace: 'foreign', name: 'token', scopes: ['*'], createdBy: 'admin' });
  const response = await secfn.router.handle(new Request('https://app.test/secfn/runtime/secrets/KEY?namespace=foreign', { headers: { authorization: `Bearer ${token.token}` } }));
  expect(response.status).toBe(403);
});
