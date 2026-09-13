import { createRouter, ForbiddenError, TooManyRequestsError, UnauthorizedError, type Route } from "@superfunctions/http";
import { SecFnForbiddenError } from "@secfn/core";
import type { SecFnRequestContext, SecFnServerConfig, SecFnAdminAction, SecretScope } from "./types.js";
import type { VaultService } from "./vault.js";
import type { AuditService } from "./audit.js";
import type { AccessService } from "./access.js";
import type { SecFnRateLimiter } from "./rate-limit.js";
import { emptyOk, errorResponse, ok, readJson } from "./envelopes.js";

export interface RouterServices {
  vault: VaultService;
  audit: AuditService;
  access: AccessService;
  rateLimit: SecFnRateLimiter;
}

type Context<TContext> = TContext & {
  params: Record<string, string>;
  query: URLSearchParams;
};

export function createSecFnRouter<TContext extends SecFnRequestContext>(
  config: SecFnServerConfig<TContext>,
  services: RouterServices,
) {
  const adminRoute = (
    method: Route<TContext>["method"],
    path: string,
    action: SecFnAdminAction,
    handler: Route<TContext>["handler"],
  ): Route<TContext> => ({
    method,
    path,
    handler: async (request, ctx) => {
      const rate = await services.rateLimit.check({
        userId: ctx.actorId,
        ip: ctx.ip,
        endpoint: new URL(request.url).pathname,
        tenantId: ctx.tenantId,
        namespace: ctx.namespace,
      });
      if (!rate.allowed) throw new TooManyRequestsError("Too many requests", "SECFN_RATE_LIMITED");
      if (!config.authorize) throw new ForbiddenError("Admin authorization is not configured", "SECFN_FORBIDDEN");
      {
        const allowed = await config.authorize(ctx, action, { params: { ...ctx.params }, query: Object.fromEntries(ctx.query), request: request.clone() });
        if (!allowed) {
          await services.audit.write({
            type: "permission_denied",
            severity: "medium",
            tenantId: ctx.tenantId,
            namespace: ctx.namespace,
            actorId: ctx.actorId,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            requestId: ctx.requestId,
            resource: `admin:${action}`,
            action,
            metadata: {},
          });
          throw new ForbiddenError("Authorization denied", "SECFN_FORBIDDEN");
        }
      }
      await assertAdminTenant(config, ctx, action);
      return handler(request, ctx);
    },
  });

  const routes: Route<TContext>[] = [
    adminRoute("GET", "/admin/namespaces", "namespaces:list", async (_request, ctx) => {
      return ok(await services.vault.listNamespaces({ tenantId: ctx.tenantId ?? ctx.query.get("tenantId") ?? undefined }));
    }),
    adminRoute("POST", "/admin/namespaces", "namespaces:create", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.createNamespace({
        tenantId: ctx.tenantId,
        slug: String(body.slug ?? body.label ?? ""),
        label: asOptionalString(body.label),
        description: asOptionalString(body.description),
        metadata: isRecord(body.metadata) ? body.metadata : undefined,
        createdBy: ctx.actorId ?? "system",
      }), { status: 201 });
    }),
    adminRoute("PATCH", "/admin/namespaces/:id", "namespaces:update", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.updateNamespace(ctx.params.id, {
        slug: asOptionalString(body.slug),
        label: asOptionalString(body.label),
        description: body.description === null ? null : asOptionalString(body.description),
        metadata: body.metadata === null ? null : isRecord(body.metadata) ? body.metadata : undefined,
      }));
    }),
    adminRoute("GET", "/admin/environments", "environments:list", async (_request, ctx) => {
      return ok(await services.vault.listEnvironments({
        tenantId: ctx.tenantId ?? ctx.query.get("tenantId") ?? undefined,
        namespaceId: ctx.query.get("namespaceId") ?? undefined,
        namespace: asQueryString(ctx.query.get("namespace")),
      }));
    }),
    adminRoute("POST", "/admin/environments", "environments:create", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.createEnvironment({
        tenantId: ctx.tenantId,
        namespaceId: asOptionalString(body.namespaceId),
        namespace: asOptionalString(body.namespace),
        name: String(body.name ?? ""),
        description: asOptionalString(body.description),
        metadata: isRecord(body.metadata) ? body.metadata : undefined,
        createdBy: ctx.actorId ?? "system",
      }), { status: 201 });
    }),
    adminRoute("PATCH", "/admin/environments/:id", "environments:update", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.updateEnvironment(ctx.params.id, {
        name: asOptionalString(body.name),
        description: body.description === null ? null : asOptionalString(body.description),
        metadata: body.metadata === null ? null : isRecord(body.metadata) ? body.metadata : undefined,
      }));
    }),
    adminRoute("GET", "/admin/secrets", "secrets:list", async (_request, ctx) => {
      const page = await services.vault.listSecrets({
        ...(await scope(config, ctx)),
        limit: Number(ctx.query.get("limit") ?? 50),
        cursor: ctx.query.get("cursor") ?? undefined,
        search: ctx.query.get("search") ?? undefined,
        tag: ctx.query.get("tag") ?? undefined,
      });
      const paginated = ctx.query.has("limit") || ctx.query.has("cursor") || ctx.query.has("search") || ctx.query.has("tag");
      return ok(paginated ? page : page.items);
    }),
    adminRoute("POST", "/admin/secrets", "secrets:create", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.createSecret({
        key: String(body.key ?? ""),
        value: String(body.value ?? ""),
        description: asOptionalString(body.description),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        metadata: isRecord(body.metadata) ? body.metadata : undefined,
        createdBy: ctx.actorId ?? "system",
        ...(await scope(config, ctx)),
      }), { status: 201 });
    }),
    adminRoute("GET", "/admin/secrets/:id", "secrets:read", async (_request, ctx) => {
      return ok(await services.vault.getSecret(ctx.params.id));
    }),
    adminRoute("PATCH", "/admin/secrets/:id", "secrets:update", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.updateSecret(ctx.params.id, {
        key: asOptionalString(body.key),
        description: body.description === null ? null : asOptionalString(body.description),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        actorId: ctx.actorId ?? "system",
        requireRenameConfirmation: body.confirmRename === true,
        ...(await scope(config, ctx)),
      }));
    }),
    adminRoute("POST", "/admin/secrets/:id/reveal", "secrets:reveal", async (request, ctx) => {
      const body = await readJson<{ confirm?: boolean }>(request);
      if (body.confirm !== true) {
        throw new SecFnForbiddenError("Secret reveal requires explicit confirmation");
      }
      return ok(await services.vault.revealSecret(ctx.params.id, {
        actorId: ctx.actorId ?? "system",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }));
    }),
    adminRoute("POST", "/admin/secrets/:id/rotate", "secrets:rotate", async (request, ctx) => {
      const body = await readJson<{ value?: string }>(request);
      return ok(await services.vault.rotateSecret(ctx.params.id, {
        value: String(body.value ?? ""),
        actorId: ctx.actorId ?? "system",
      }));
    }),
    adminRoute("POST", "/admin/secrets/:id/revoke", "secrets:revoke", async (_request, ctx) => {
      await services.vault.revokeSecret(ctx.params.id, ctx.actorId ?? "system");
      return emptyOk();
    }),
    adminRoute("DELETE", "/admin/secrets/:id", "secrets:delete", async (_request, ctx) => {
      await services.vault.deleteSecret(ctx.params.id, ctx.actorId ?? "system");
      return emptyOk();
    }),
    adminRoute("GET", "/admin/secret-sets", "secret-sets:list", async (_request, ctx) => {
      return ok(await services.vault.listSecretSets(await scope(config, ctx)));
    }),
    adminRoute("POST", "/admin/secret-sets", "secret-sets:create", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.createSecretSet({
        name: String(body.name ?? ""),
        description: asOptionalString(body.description),
        members: Array.isArray(body.members) ? body.members.map((member) => ({
          secretId: String((member as Record<string, unknown>).secretId ?? ""),
          alias: asOptionalString((member as Record<string, unknown>).alias),
        })) : undefined,
        createdBy: ctx.actorId ?? "system",
        ...(await scope(config, ctx)),
      }), { status: 201 });
    }),
    adminRoute("GET", "/admin/secret-sets/:id", "secret-sets:read", async (_request, ctx) => {
      return ok(await services.vault.getSecretSet(ctx.params.id));
    }),
    adminRoute("PATCH", "/admin/secret-sets/:id", "secret-sets:update", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.updateSecretSet(ctx.params.id, {
        name: asOptionalString(body.name),
        description: body.description === null ? null : asOptionalString(body.description),
        actorId: ctx.actorId ?? "system",
      }));
    }),
    adminRoute("POST", "/admin/secret-sets/:id/reveal", "secret-sets:reveal", async (request, ctx) => {
      const body = await readJson<{ confirm?: boolean }>(request);
      if (body.confirm !== true) {
        throw new SecFnForbiddenError("Secret set reveal requires explicit confirmation");
      }
      return ok(await services.vault.revealSecretSet(ctx.params.id, {
        actorId: ctx.actorId ?? "system",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      }));
    }),
    adminRoute("DELETE", "/admin/secret-sets/:id", "secret-sets:delete", async (_request, ctx) => {
      await services.vault.deleteSecretSet(ctx.params.id, ctx.actorId ?? "system");
      return emptyOk();
    }),
    adminRoute("GET", "/admin/secret-sets/:id/members", "secret-set-members:list", async (_request, ctx) => {
      return ok(await services.vault.listSecretSetMembers(ctx.params.id));
    }),
    adminRoute("POST", "/admin/secret-sets/:id/members", "secret-set-members:create", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.addSecretSetMember(
        ctx.params.id,
        String(body.secretId ?? ""),
        asOptionalString(body.alias),
      ), { status: 201 });
    }),
    adminRoute("PATCH", "/admin/secret-sets/:id/members/:memberId", "secret-set-members:update", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.updateSecretSetMember(ctx.params.memberId, {
        secretId: asOptionalString(body.secretId),
        alias: body.alias === null ? null : asOptionalString(body.alias),
      }));
    }),
    adminRoute("DELETE", "/admin/secret-sets/:id/members/:memberId", "secret-set-members:delete", async (_request, ctx) => {
      await services.vault.removeSecretSetMember(ctx.params.memberId);
      return emptyOk();
    }),
    adminRoute("POST", "/admin/service-tokens", "service-tokens:create", async (request, ctx) => {
      const body = await readJson<Record<string, unknown>>(request);
      return ok(await services.vault.createServiceToken({
        name: String(body.name ?? ""),
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
        expiresAt: asOptionalString(body.expiresAt),
        createdBy: ctx.actorId ?? "system",
        ...(await scope(config, ctx)),
      }), { status: 201 });
    }),
    adminRoute("POST", "/admin/service-tokens/:id/revoke", "service-tokens:revoke", async (_request, ctx) => {
      await services.vault.revokeServiceToken(ctx.params.id, ctx.actorId ?? "system");
      return emptyOk();
    }),
    adminRoute("GET", "/admin/audit-events", "audit-events:list", async (_request, ctx) => {
      return ok(await services.audit.queryEvents({
        tenantId: ctx.tenantId ?? ctx.query.get("tenantId") ?? undefined,
        namespace: ctx.query.get("namespace") ?? undefined,
        type: ctx.query.get("type") ?? undefined,
        severity: ctx.query.get("severity") ?? undefined,
        limit: Number(ctx.query.get("limit") ?? 100),
      }));
    }),
    adminRoute("GET", "/admin/scan-runs", "scan-runs:list", async (_request, ctx) => {
      return ok(await config.db.findMany({
        model: "secfn_scan_runs",
        where: ctx.tenantId ? [{ field: "tenantId", operator: "eq", value: ctx.tenantId }] : [],
        orderBy: [{ field: "startedAt", direction: "desc" }],
        limit: 100,
      }));
    }),
    {
      method: "GET",
      path: "/runtime/secrets/:key",
      handler: async (request, ctx) => runtimeRead(request, ctx, config, services, "secret"),
    },
    {
      method: "POST",
      path: "/runtime/secret-sets/:name/resolve",
      handler: async (request, ctx) => runtimeRead(request, ctx, config, services, "set"),
    },
    {
      method: "GET",
      path: "/runtime/health",
      handler: async () => ok({ status: "ok" }),
    },
  ];

  return createRouter<TContext>({
    basePath: config.basePath ?? "/secfn",
    routes,
    context: config.context ?? ({} as TContext),
    onError: async (error) => errorResponse(error),
  });
}

/** Tenant context is trusted; request identifiers may narrow it but cannot replace it. */
async function assertAdminTenant<TContext extends SecFnRequestContext>(config: SecFnServerConfig<TContext>, ctx: Context<TContext>, action: SecFnAdminAction) {
  if (!ctx.tenantId) return; // Explicitly authorized global operator; host owns this privilege.
  const reject = () => { throw new ForbiddenError("Resource is outside the authorized tenant", "SECFN_FORBIDDEN"); };
  if (ctx.query.has('tenantId') && ctx.query.get('tenantId') !== ctx.tenantId) reject();
  const family = action.split(':')[0];
  const models: Record<string, string> = { secrets: 'secfn_secrets', 'secret-sets': 'secfn_secret_sets', 'secret-set-members': 'secfn_secret_sets', namespaces: 'secfn_namespaces', environments: 'secfn_environments', 'service-tokens': 'secfn_service_tokens' };
  async function owned(model: string, id: string) {
    const row = await config.db.findOne<Record<string, unknown>>({ model, where: [{ field: 'id', operator: 'eq', value: id }, { field: 'tenantId', operator: 'eq', value: ctx.tenantId }] });
    if (!row) reject();
  }
  if (ctx.params.id && models[family]) await owned(models[family], ctx.params.id);
  for (const [key, model] of [['namespaceId','secfn_namespaces'], ['environmentId','secfn_environments']]) {
    const id = ctx.query.get(key); if (id) await owned(model, id);
  }
  if (ctx.params.memberId) {
    const member = await config.db.findOne<Record<string, unknown>>({ model: 'secfn_secret_set_members', where: [{ field: 'id', operator: 'eq', value: ctx.params.memberId }, { field: 'setId', operator: 'eq', value: ctx.params.id }] });
    if (!member) reject();
  }
}

async function runtimeRead<TContext extends SecFnRequestContext>(
  request: Request,
  ctx: Context<TContext>,
  config: SecFnServerConfig<TContext>,
  services: RouterServices,
  kind: "secret" | "set",
): Promise<Response> {
  const endpoint = new URL(request.url).pathname;
  const rate = await services.rateLimit.check({
    userId: undefined,
    ip: ctx.ip,
    endpoint,
    tenantId: ctx.tenantId,
    namespace: ctx.namespace,
  });
  if (!rate.allowed) throw new TooManyRequestsError("Too many requests", "SECFN_RATE_LIMITED");

  const tokenValue = bearerToken(request);
  if (!tokenValue) throw new UnauthorizedError("Missing runtime token", "SECFN_UNAUTHORIZED");
  const requestScope = await scope(config, ctx);
  const environment = ctx.query.get("environment") ?? undefined;
  const fullScope: SecretScope = {
    ...requestScope,
    environment: environment as SecretScope["environment"],
  };
  const verified = await services.vault.verifyRuntimeToken(tokenValue, fullScope);
  try {
    if (kind === "secret") {
      return ok(await services.vault.readRuntimeSecret(ctx.params.key, verified, fullScope, ctx));
    }
    return ok(await services.vault.resolveRuntimeSet(ctx.params.name, verified, fullScope, ctx));
  } catch (error) {
    if (error instanceof SecFnForbiddenError) {
      await services.audit.write({
        type: "permission_denied",
        severity: "medium",
        tenantId: fullScope.tenantId,
        namespace: fullScope.namespace,
        actorId: verified.token.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
        resource: kind === "secret" ? `secret:${ctx.params.key}` : `set:${ctx.params.name}`,
        action: "read",
        metadata: { reason: error.message },
      });
    }
    throw error;
  }
}

async function scope<TContext extends SecFnRequestContext>(
  config: SecFnServerConfig<TContext>,
  ctx: Context<TContext>,
): Promise<SecretScope> {
  const environment = asQueryString(ctx.query.get("environment"));
  const namespace = asQueryString(ctx.query.get("namespace"));
  return {
    tenantId: ctx.tenantId,
    namespaceId: ctx.query.get("namespaceId") ?? undefined,
    namespace: namespace ?? await config.namespaceProvider?.(ctx) ?? ctx.namespace,
    environmentId: ctx.query.get("environmentId") ?? undefined,
    environment: environment as SecretScope["environment"],
  };
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return undefined;
  return header.slice("bearer ".length).trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asQueryString(value: string | null): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
