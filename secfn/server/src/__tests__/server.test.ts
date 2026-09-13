import { describe, expect, it } from "vitest";
import { createSecFnServer } from "../index.js";
import { MemoryAdapter } from "./memory-adapter.js";

function createServer(options: { allowAdmin?: boolean; rateLimit?: boolean } = {}) {
  const db = new MemoryAdapter();
  const secfn = createSecFnServer({
    db,
    encryption: { masterKey: "test-master-key", keyId: "test" },
    context: (request) => ({
      actorId: request.headers.get("x-actor-id") ?? undefined,
      tenantId: request.headers.get("x-tenant-id") ?? "tenant-a",
      namespace: request.headers.get("x-namespace") ?? "workspace-a",
      ip: request.headers.get("x-forwarded-for") ?? "127.0.0.1",
      userAgent: request.headers.get("user-agent") ?? undefined,
      requestId: request.headers.get("x-request-id") ?? undefined,
    }),
    authorize: async () => options.allowAdmin ?? true,
    rateLimit: options.rateLimit
      ? {
        enabled: true,
        persistence: db,
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
  await secfn.vault.createSecret({ tenantId: "tenant-a", namespaceId: ns.id, environmentId: env.id, key: "KEY", value: "private", createdBy: "admin" });
  const token = await secfn.vault.createServiceToken({ tenantId: "tenant-a", namespaceId: ns.id, environmentId: env.id, name: "by-id", scopes: ["secret:KEY"], createdBy: "admin" });
  expect(token.record).toMatchObject({ tenantId: "tenant-a", namespace: "canonical", environment: "production" });
  const scope = { tenantId: "tenant-a", namespace: "canonical", environment: "production" };
  const verified = await secfn.vault.verifyRuntimeToken(token.token, scope);
  expect((await secfn.vault.readRuntimeSecret("KEY", verified, scope)).value).toBe("private");
  await expect(secfn.vault.verifyRuntimeToken(token.token, { ...scope, environment: "development" })).rejects.toThrow();
  await expect(secfn.vault.createServiceToken({ tenantId: "other", namespaceId: ns.id, name: "bad", scopes: ["*"], createdBy: "admin" })).rejects.toThrow();
});
