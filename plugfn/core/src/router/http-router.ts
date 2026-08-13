import { createHash, randomBytes } from 'node:crypto';
import { createRouter, type Middleware, type Route, type Router } from '@superfunctions/http';
import type { AuthSession } from '@superfunctions/auth';
import { ok as envelopeOk, err as envelopeErr } from '@superfunctions/envelope';
import { SuperfunctionError } from '@superfunctions/errors';
import type { PlugFn } from '../core/plug-fn.js';
import type { PlugFnPrincipal } from '../types/config.js';
import type { Connection, HandleCallbackResult } from '../types/connection.js';
import type { PlugFnApiEnvelope, PlugFnResponseMeta } from '../types/protocol.js';
import type { PlugFnConnectionOwner } from '../types/runtime.js';
import { hasAny, tenantMatches } from '../security/tenancy.js';

export interface RouteAuthContext {
  userId: string;
  tenantId?: string;
  organizationId?: string;
  roles?: string[];
  grants?: string[];
}

export interface PlugFnRouterOptions {
  authenticate?: (request: Request) => Promise<RouteAuthContext | null> | RouteAuthContext | null;
  /** Fallback browser redirect when OAuth state has no returnTo (dev/examples). */
  defaultReturnTo?: string;
  webhookSecret?:
    | Record<string, string>
    | ((
        provider: string,
        request: Request,
        headers: Record<string, string>
      ) => Promise<string | undefined> | string | undefined);
  /** Resolve the direct client IP from trusted adapter/server metadata. */
  resolveWebhookClientIp?: (
    request: Request
  ) => Promise<string | undefined> | string | undefined;
  maxWebhookPayloadBytes?: number;
}

interface PlugFnContext {
  plugFn: PlugFn;
  authContext?: RouteAuthContext;
}

interface DeterministicError {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  details: Record<string, unknown>;
}

interface ParseJsonBodyOptions {
  maxBytes?: number;
}

const DEFAULT_WEBHOOK_PAYLOAD_MAX_BYTES = 2 * 1024 * 1024;
const WEBHOOK_DELIVERY_LEASE_MS = 5 * 60 * 1000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function createPlugFnRouter(
  plugFn: PlugFn,
  options: PlugFnRouterOptions = {}
): Router<PlugFnContext> {
  const maxWebhookPayloadBytes =
    options.maxWebhookPayloadBytes ??
    plugFn.config.webhooks?.maxPayloadSize ??
    DEFAULT_WEBHOOK_PAYLOAD_MAX_BYTES;
  const authenticate = options.authenticate ?? plugFn.config.auth.authenticate;

  const requireAuth: Middleware<PlugFnContext> = async (request, context, next) => {
    try {
      const authContext = await resolveAuthContext(request, authenticate);
      if (!authContext) {
        return errorResponse({
          code: 'PLUGFN_AUTH_REQUIRED',
          message: 'authentication required',
          status: 401,
          retryable: false,
          details: {},
        });
      }

      context.authContext = authContext;
      assertIdentityMatchesQuery(new URL(request.url).searchParams, authContext);
      return next();
    } catch (error) {
      return errorResponse(toDeterministicError(error));
    }
  };

  const routes: Route<PlugFnContext>[] = [
    {
      method: 'GET',
      path: '/callback',
      handler: async (_req, ctx) => {
        const { code, state } = Object.fromEntries(ctx.query);

        if (!code || !state) {
          return errorResponse({
            code: 'VALIDATION_ERROR',
            message: 'missing code or state',
            status: 400,
            retryable: false,
            details: {},
          });
        }

        try {
          const result = await ctx.plugFn.connections.handleCallback({
            code,
            state,
          });

          return oauthCallbackResponse(ctx, result, options);
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'GET',
      path: '/callback/:provider',
      handler: async (_req, ctx) => {
        const { provider } = ctx.params;
        const { code, state } = Object.fromEntries(ctx.query);

        if (!code || !state) {
          return errorResponse({
            code: 'VALIDATION_ERROR',
            message: 'missing code or state',
            status: 400,
            retryable: false,
            details: {},
          });
        }

        try {
          assertProviderConfigured(ctx, provider);
          const result = await ctx.plugFn.connections.handleCallback({
            provider,
            code,
            state,
          });

          return oauthCallbackResponse(ctx, result, options);
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'POST',
      path: '/webhooks/:provider',
      handler: async (req, ctx) => {
        const { provider } = ctx.params;

        return handleWebhookRoute(req, ctx, provider, undefined, {
          maxWebhookPayloadBytes,
          webhookSecret: options.webhookSecret,
          resolveWebhookClientIp: options.resolveWebhookClientIp,
        });
      },
    },
    {
      method: 'POST',
      path: '/webhooks/:provider/:event',
      handler: async (req, ctx) => {
        const { provider, event } = ctx.params;

        return handleWebhookRoute(req, ctx, provider, event, {
          maxWebhookPayloadBytes,
          webhookSecret: options.webhookSecret,
          resolveWebhookClientIp: options.resolveWebhookClientIp,
        });
      },
    },
    {
      method: 'GET',
      path: '/healthz',
      handler: async () => successResponse({ status: 'ok' }),
    },
    {
      method: 'GET',
      path: '/readyz',
      handler: async (_req, ctx) => {
        const configuredProviders = Object.keys(ctx.plugFn.config.integrations ?? {});
        const missingProviders = configuredProviders.filter((provider) => !ctx.plugFn.providers.get(provider));

        if (missingProviders.length > 0) {
          return errorResponse({
            code: 'PLUGFN_NOT_READY',
            message: 'configured providers are not registered',
            status: 503,
            retryable: true,
            details: { missingProviders },
          });
        }

        return successResponse({
          status: 'ready',
          providers: configuredProviders.length,
        });
      },
    },
    {
      method: 'GET',
      path: '/providers',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const providers = ctx.plugFn.providers.list();

        return successResponse({
          providers: providers.map((provider) => ({
            name: provider.name,
            displayName: provider.displayName,
            description: provider.description,
            authType: provider.auth.type,
          })),
        });
      },
    },
    {
      method: 'GET',
      path: '/connections',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const provider = ctx.query.get('provider');
        const authContext = requireAuthContext(ctx);

        const ownConnections = await ctx.plugFn.connections.list({
          userId: authContext.userId,
          provider: provider || undefined,
        });
        let connections = ownConnections;
        if (
          authContext.organizationId &&
          hasAny(authContext.roles, ['admin', 'owner', 'org:admin'])
        ) {
          const organizationConnections = await ctx.plugFn.connections.list({
            userId: authContext.userId,
            provider: provider || undefined,
            owner: {
              kind: 'organization',
              organizationId: authContext.organizationId,
              installedByUserId: authContext.userId,
              tenantId: authContext.tenantId,
            },
          });
          connections = deduplicateConnections([...ownConnections, ...organizationConnections])
            .filter((connection) => connectionMatchesAuthContext(connection, authContext));
        }

        return successResponse({
          connections,
          userId: authContext.userId,
        });
      },
    },
    {
      method: 'GET',
      path: '/connections/:connectionId',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        try {
          const authContext = requireAuthContext(ctx);
          const connection = await requireAuthorizedConnection(
            ctx,
            ctx.params.connectionId,
            authContext,
            'read'
          );
          return successResponse({ connection });
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'GET',
      path: '/connections/:connectionId/status',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        try {
          const authContext = requireAuthContext(ctx);
          const connection = await requireAuthorizedConnection(
            ctx,
            ctx.params.connectionId,
            authContext,
            'read'
          );
          return successResponse({
            connection: {
              id: connection.id,
              provider: connection.provider,
              status: connection.status,
            },
          });
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'POST',
      path: '/connections/start',
      middleware: [requireAuth],
      handler: async (req, ctx) => {
        try {
          const body = await parseJsonBody(req);
          const authContext = requireAuthContext(ctx);
          assertIdentityMatches(body, authContext);

          const provider = asString(body.provider);
          const redirectUri = asString(body.redirectUri);
          const scopes = asStringArray(body.scopes);
          const connectionName = asOptionalString(body.connectionName);
          const returnTo = asOptionalString(body.returnTo);
          const prompt = asOptionalString(body.prompt);
          const loginHint = asOptionalString(body.loginHint);
          const owner = asConnectionOwner(body.owner) ?? {
            kind: 'user',
            userId: authContext.userId,
            tenantId: authContext.tenantId,
          };

          if (!provider || !redirectUri) {
            return errorResponse({
              code: 'VALIDATION_ERROR',
              message: 'missing required fields: provider, redirectUri',
              status: 400,
              retryable: false,
              details: {},
            });
          }

          assertProviderConfigured(ctx, provider);
          const started = await ctx.plugFn.connections.start({
            userId: authContext.userId,
            provider,
            redirectUri,
            scopes,
            connectionName,
            returnTo,
            prompt,
            loginHint,
            owner,
            actor: {
              userId: authContext.userId,
              tenantId: authContext.tenantId,
              organizationId: authContext.organizationId,
            },
          });

          return successResponse(started);
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'POST',
      path: '/connections/disconnect',
      middleware: [requireAuth],
      handler: async (req, ctx) => {
        try {
          const body = await parseJsonBody(req);
          const authContext = requireAuthContext(ctx);
          assertIdentityMatches(body, authContext);

          const provider = asString(body.provider);
          const connectionId = asOptionalString(body.connectionId);

          if (!provider) {
            return errorResponse({
              code: 'VALIDATION_ERROR',
              message: 'missing required field: provider',
              status: 400,
              retryable: false,
              details: {},
            });
          }

          if (connectionId) {
            await requireAuthorizedConnection(ctx, connectionId, authContext, 'disconnect');
          }

          const result = await ctx.plugFn.connections.disconnect({
            userId: authContext.userId,
            provider,
            connectionId,
            actor: authContext,
          });

          return successResponse({
            success: result.disconnected,
            ...result,
          });
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'GET',
      path: '/workflows',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const status = asOptionalString(ctx.query.get('status'));
        const authContext = requireAuthContext(ctx);

        const workflows = await ctx.plugFn.workflows.list({
          userId: authContext.userId,
          status: status as any,
        });

        return successResponse({
          workflows,
        });
      },
    },
    {
      method: 'POST',
      path: '/sync/jobs',
      middleware: [requireAuth],
      handler: async (req, ctx) => {
        try {
          const body = await parseJsonBody(req);
          const authContext = requireAuthContext(ctx);
          const provider = asString(body.provider);
          const connectionId = asString(body.connectionId);
          const resource = asString(body.resource);
          const mode = body.mode === 'incremental' ? 'incremental' : 'full';

          if (!provider || !connectionId || !resource) {
            return errorResponse({
              code: 'VALIDATION_ERROR',
              message: 'missing required fields: provider, connectionId, resource',
              status: 400,
              retryable: false,
              details: {},
            });
          }

          const connection = await requireAuthorizedConnection(
            ctx,
            connectionId,
            authContext,
            'sync'
          );
          if (connection.provider !== provider) {
            return errorResponse({
              code: 'VALIDATION_ERROR',
              message: 'connection provider mismatch',
              status: 400,
              retryable: false,
              details: {},
            });
          }

          const job = await ctx.plugFn.sync[mode === 'incremental' ? 'incremental' : 'backfill']({
            provider,
            connectionId,
            resource,
            cursor: asOptionalString(body.cursor),
            checkpoint: body.checkpoint,
            sinkId: asOptionalString(body.sinkId),
            metadata: isPlainObject(body.metadata) ? body.metadata : undefined,
            actor: authContext,
          });

          return successResponse({ job });
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'GET',
      path: '/sync/jobs',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const provider = asOptionalString(ctx.query.get('provider'));
        const connectionId = asOptionalString(ctx.query.get('connectionId'));
        const status = asOptionalString(ctx.query.get('status'));
        const authContext = requireAuthContext(ctx);
        const filters: Record<string, unknown> = {};
        if (provider) {
          filters.provider = provider;
        }
        if (connectionId) {
          filters.connectionId = connectionId;
        }
        if (status) {
          filters.status = status;
        }

        const ownJobs = await ctx.plugFn.runtime.sync.listJobs({
          ...filters,
          ownerKind: 'user',
          ownerId: authContext.userId,
        });
        let jobs = ownJobs;
        if (authContext.organizationId) {
          const organizationJobs = await ctx.plugFn.runtime.sync.listJobs({
            ...filters,
            ownerKind: 'organization',
            ownerId: authContext.organizationId,
          });
          const authorizedOrganizationJobs = await filterAuthorizedSyncJobs(
            ctx,
            organizationJobs,
            authContext
          );
          jobs = deduplicateSyncJobs([...ownJobs, ...authorizedOrganizationJobs]);
        }
        return successResponse({ jobs });
      },
    },
    {
      method: 'GET',
      path: '/sync/jobs/:jobId',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const authContext = requireAuthContext(ctx);
        const job = await requireAuthorizedSyncJob(ctx, ctx.params.jobId, authContext);
        return successResponse({ job });
      },
    },
    {
      method: 'POST',
      path: '/sync/jobs/:jobId/cancel',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        try {
          const authContext = requireAuthContext(ctx);
          await requireAuthorizedSyncJob(ctx, ctx.params.jobId, authContext);
          const job = await ctx.plugFn.runtime.sync.updateJob(ctx.params.jobId, {
            status: 'cancelled',
          });
          return successResponse({ job });
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'POST',
      path: '/sync/checkpoints',
      middleware: [requireAuth],
      handler: async (req, ctx) => {
        try {
          const body = await parseJsonBody(req);
          const provider = asString(body.provider);
          const connectionId = asString(body.connectionId);
          const resource = asString(body.resource);

          if (!provider || !connectionId || !resource) {
            return errorResponse({
              code: 'VALIDATION_ERROR',
              message: 'missing required fields: provider, connectionId, resource',
              status: 400,
              retryable: false,
              details: {},
            });
          }

          const authContext = requireAuthContext(ctx);
          const connection = await requireAuthorizedConnection(
            ctx,
            connectionId,
            authContext,
            'checkpoint'
          );
          if (connection.provider !== provider) {
            return errorResponse({
              code: 'VALIDATION_ERROR',
              message: 'connection provider mismatch',
              status: 400,
              retryable: false,
              details: {},
            });
          }

          const checkpoint = await ctx.plugFn.runtime.sync.upsertCheckpoint({
            provider,
            connectionId,
            resource,
            checkpoint: body.checkpoint,
          });

          return successResponse({ checkpoint });
        } catch (error) {
          return errorResponse(toDeterministicError(error));
        }
      },
    },
    {
      method: 'GET',
      path: '/events',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const authContext = requireAuthContext(ctx);
        const provider = asOptionalString(ctx.query.get('provider'));
        const event = asOptionalString(ctx.query.get('event'));
        const filters: Record<string, unknown> = {
          ownerKind: 'user',
          ownerId: authContext.userId,
        };
        if (provider) {
          filters.provider = provider;
        }
        if (event) {
          filters.event = event;
        }
        const events = await ctx.plugFn.runtime.events.list(filters);
        return successResponse({ events });
      },
    },
    {
      method: 'GET',
      path: '/metrics',
      middleware: [requireAuth],
      handler: async (_req, ctx) => {
        const timeRange = asOptionalString(ctx.query.get('timeRange'));
        const groupBy = asOptionalString(ctx.query.get('groupBy'));
        const provider = asOptionalString(ctx.query.get('provider'));
        const authContext = requireAuthContext(ctx);

        const metrics = await ctx.plugFn.getMetrics({
          timeRange: timeRange as any,
          groupBy: groupBy as any,
          provider,
          userId: authContext.userId,
        });

        return successResponse({
          metrics,
        });
      },
    },
  ];

  return createRouter<PlugFnContext>({
    context: { plugFn },
    routes,
  });
}

function requireAuthContext(context: PlugFnContext): RouteAuthContext {
  if (!context.authContext) {
    throw {
      code: 'PLUGFN_AUTH_REQUIRED',
      message: 'authentication required',
      status: 401,
    };
  }

  return context.authContext;
}

async function requireAuthorizedConnection(
  context: PlugFnContext,
  connectionId: string,
  authContext: RouteAuthContext,
  operation: 'read' | 'disconnect' | 'revoke' | 'sync' | 'action' | 'checkpoint'
): Promise<Connection> {
  const connection = await context.plugFn.connections.get(connectionId);
  return authorizeConnection(context, connection, authContext, operation);
}

async function authorizeConnection(
  context: PlugFnContext,
  connection: Connection,
  authContext: RouteAuthContext,
  operation: 'read' | 'disconnect' | 'revoke' | 'sync' | 'action' | 'checkpoint'
): Promise<Connection> {
  const customAuthorizer = context.plugFn.config.authorization?.authorizeConnection;
  if (customAuthorizer) {
    const allowed = await customAuthorizer({
      actor: authContext,
      connection,
      operation,
    });
    if (allowed) {
      return connection;
    }
  } else if (connectionMatchesAuthContext(connection, authContext)) {
    return connection;
  }

  throw {
    code: 'TENANT_ACCESS_DENIED',
    message: 'connection owner mismatch',
    status: 403,
  };
}

async function requireAuthorizedSyncJob(
  context: PlugFnContext,
  jobId: string,
  authContext: RouteAuthContext
) {
  const job = await context.plugFn.runtime.sync.getJob(jobId);
  if (!job) {
    throw {
      code: 'NOT_FOUND',
      message: 'sync job not found',
      status: 404,
    };
  }
  return authorizeSyncJob(context, job, authContext);
}

async function authorizeSyncJob(
  context: PlugFnContext,
  job: NonNullable<Awaited<ReturnType<PlugFn['runtime']['sync']['getJob']>>>,
  authContext: RouteAuthContext,
  connectionCache?: Map<string, Promise<Connection>>
) {
  if (job.ownerKind === 'user' && job.ownerId === authContext.userId) {
    return job;
  }

  if (job.connectionId) {
    let connectionPromise = connectionCache?.get(job.connectionId);
    if (!connectionPromise) {
      connectionPromise = context.plugFn.connections.get(job.connectionId);
      connectionCache?.set(job.connectionId, connectionPromise);
    }
    const connection = await connectionPromise;
    await authorizeConnection(context, connection, authContext, 'sync');
    return job;
  }

  throw {
    code: 'TENANT_ACCESS_DENIED',
    message: 'sync job owner mismatch',
    status: 403,
  };
}

async function filterAuthorizedSyncJobs(
  context: PlugFnContext,
  jobs: Awaited<ReturnType<PlugFn['runtime']['sync']['listJobs']>>,
  authContext: RouteAuthContext
) {
  const connectionCache = new Map<string, Promise<Connection>>();
  const authorizationResults = await Promise.all(
    jobs.map(async (job) => {
      try {
        await authorizeSyncJob(context, job, authContext, connectionCache);
        return job;
      } catch (error) {
        if (!isExpectedAuthorizationMiss(error)) {
          throw error;
        }
        return undefined;
      }
    })
  );
  return authorizationResults.filter((job): job is NonNullable<typeof job> => Boolean(job));
}

function connectionMatchesAuthContext(
  connection: Connection,
  authContext: RouteAuthContext
): boolean {
  if (connection.userId === authContext.userId) {
    return tenantMatches(connection.tenantId, authContext.tenantId);
  }

  if (connection.ownerKind === 'user' && connection.ownerId === authContext.userId) {
    return tenantMatches(connection.tenantId, authContext.tenantId);
  }

  if (connection.ownerKind === 'organization') {
    const belongsToActorOrganization =
      Boolean(connection.organizationId) &&
      Boolean(authContext.organizationId) &&
      connection.organizationId === authContext.organizationId;
    return (
      connection.installedByUserId === authContext.userId ||
      (belongsToActorOrganization &&
        tenantMatches(connection.tenantId, authContext.tenantId) &&
        hasAny(authContext.roles, ['admin', 'owner', 'org:admin']))
    );
  }

  if (connection.ownerKind === 'delegated') {
    return (
      connection.delegatedToUserId === authContext.userId ||
      connection.installedByUserId === authContext.userId ||
      hasAny(authContext.grants, connection.grants ?? [])
    );
  }

  return false;
}

function deduplicateConnections(connections: Connection[]): Connection[] {
  return [...new Map(connections.map((connection) => [connection.id, connection])).values()];
}

function deduplicateSyncJobs(
  jobs: Awaited<ReturnType<PlugFn['runtime']['sync']['listJobs']>>
) {
  return [...new Map(jobs.map((job) => [job.id, job])).values()];
}

function isExpectedAuthorizationMiss(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    code === 'TENANT_ACCESS_DENIED' ||
    code === 'NOT_FOUND' ||
    code === 'CONNECTION_NOT_FOUND'
  );
}

async function resolveAuthContext(
  request: Request,
  authenticate?: PlugFnRouterOptions['authenticate']
): Promise<RouteAuthContext | null> {
  if (!authenticate) {
    return null;
  }

  return normalizeAuthContext(await authenticate(request));
}

async function resolveWebhookSecret(
  provider: string,
  request: Request,
  headers: Record<string, string>,
  resolver: PlugFnRouterOptions['webhookSecret']
): Promise<string | undefined> {
  if (!resolver) {
    return undefined;
  }

  if (typeof resolver === 'function') {
    return await resolver(provider, request, headers);
  }

  return resolver[provider];
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const normalized: Record<string, string> = {};
  headers.forEach((value, key) => {
    normalized[key.toLowerCase()] = value;
  });
  return normalized;
}

async function handleWebhookRoute(
  req: Request,
  ctx: PlugFnContext,
  provider: string,
  event: string | undefined,
  options: Pick<PlugFnRouterOptions, 'webhookSecret' | 'resolveWebhookClientIp'> & {
    maxWebhookPayloadBytes: number;
  }
): Promise<Response> {
  let deliveryId: string | undefined;
  let receiptId: string | undefined;
  let rawBody: Uint8Array | undefined;
  let headers: Record<string, string> | undefined;
  let payloadHash: string | undefined;
  let idempotencyKey: string | undefined;
  let resolvedEvent = event ?? 'event';
  let verificationStatus: 'verified' | 'not-required';

  try {
    headers = normalizeHeaders(req.headers);
    await assertWebhookSourceAllowed(
      req,
      ctx.plugFn.config.webhooks?.allowedIPs,
      options.resolveWebhookClientIp
    );
    rawBody = await readRequestBytes(req, { maxBytes: options.maxWebhookPayloadBytes });
    if (!event) {
      resolvedEvent = inferWebhookEvent(
        provider,
        headers,
        rawBody,
        ctx.plugFn.providers.get(provider)?.triggers
      );
    }
    const secret = await resolveWebhookSecret(provider, req, headers, options.webhookSecret);
    const currentPayloadHash = createHash('sha256').update(rawBody).digest('hex');
    payloadHash = currentPayloadHash;
    idempotencyKey = readWebhookIdempotencyKey(provider, headers, rawBody);
    if (idempotencyKey) {
      const existing = await ctx.plugFn.runtime.webhooks.findReceiptByIdempotencyKey(
        provider,
        idempotencyKey
      );
      if (existing) {
        if (existing.payloadHash !== currentPayloadHash) {
          throw {
            code: 'WEBHOOK_IDEMPOTENCY_CONFLICT',
            message: 'webhook idempotency key was reused with a different payload',
            status: 409,
            retryable: false,
            details: {
              receiptId: existing.id,
            },
          };
        }
        if (
          existing.verificationStatus === 'verified' ||
          existing.verificationStatus === 'not-required'
        ) {
          const disposition = await webhookReceiptDisposition(ctx, existing);
          if (disposition === 'retry') {
            receiptId = existing.id;
          } else {
            return successResponse({
              duplicate: true,
              receiptId: existing.id,
              event: {
                provider,
                event: resolvedEvent,
                verified: true,
              },
            });
          }
        }
      }
    }

    const verification = await ctx.plugFn.webhooks.verify(
      provider,
      resolvedEvent,
      undefined,
      headers,
      secret,
      { rawBody }
    );
    verificationStatus = verification.verified === false ? 'not-required' : 'verified';

    const receiptClaimToken = idempotencyKey
      ? `claim_${randomBytes(12).toString('hex')}`
      : undefined;
    const receipt = await ctx.plugFn.runtime.webhooks.createReceipt({
      provider,
      event: resolvedEvent,
      payloadHash: currentPayloadHash,
      idempotencyKey,
      headersRedacted: redactHeaders(headers),
      verificationStatus,
      metadata: {
        contentType: headers['content-type'],
        userAgent: headers['user-agent'],
        ...(receiptClaimToken ? { receiptClaimToken } : {}),
      },
    });
    if (
      receiptClaimToken &&
      receipt.metadata?.receiptClaimToken !== receiptClaimToken &&
      (receipt.verificationStatus === 'verified' || receipt.verificationStatus === 'not-required') &&
      (await webhookReceiptDisposition(ctx, receipt)) !== 'retry'
    ) {
      return successResponse({
        duplicate: true,
        receiptId: receipt.id,
        event: {
          provider,
          event: resolvedEvent,
          verified: true,
        },
      });
    }
    receiptId = receipt.id;
    if (receipt.verificationStatus !== verificationStatus) {
      await ctx.plugFn.runtime.webhooks.updateReceipt(receipt.id, {
        verificationStatus,
      });
    }
    const delivery = await ctx.plugFn.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      handlerName: `${provider}.${resolvedEvent}`,
      status: 'running',
      metadata: {
        provider,
        event: resolvedEvent,
        payloadHash: currentPayloadHash,
        idempotencyKey,
      },
    });
    deliveryId = delivery.id;

    const webhookEvent = await ctx.plugFn.webhooks.handle(
      provider,
      resolvedEvent,
      undefined,
      headers,
      secret,
      { rawBody }
    );

    await ctx.plugFn.runtime.webhooks.updateDelivery(delivery.id, {
      status: 'success',
      attempts: delivery.attempts + 1,
    });

    return successResponse({
      event: webhookEvent,
      receiptId: receipt.id,
      deliveryId: delivery.id,
    });
  } catch (error) {
    if (!receiptId) {
      await createFailedWebhookReceipt(
        ctx,
        provider,
        resolvedEvent,
        headers,
        payloadHash,
        idempotencyKey,
        error
      );
    } else if (!deliveryId) {
      await ctx.plugFn.runtime.webhooks.updateReceipt(receiptId, {
        verificationStatus: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'webhook handler failed',
        },
      });
    } else {
      await ctx.plugFn.runtime.webhooks.updateReceipt(receiptId, {
        metadata: {
          error: error instanceof Error ? error.message : 'webhook handler failed',
        },
      });
    }
    if (deliveryId) {
      await ctx.plugFn.runtime.webhooks.updateDelivery(deliveryId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'webhook handler failed',
      });
    }
    return errorResponse(toDeterministicError(error));
  }
}

async function webhookReceiptDisposition(
  ctx: PlugFnContext,
  receipt: NonNullable<Awaited<ReturnType<PlugFn['runtime']['webhooks']['getReceipt']>>>
): Promise<'complete' | 'active' | 'retry'> {
  const deliveries = await ctx.plugFn.runtime.webhooks.listDeliveries(receipt.id);
  if (deliveries.some((delivery) => delivery.status === 'success')) {
    return 'complete';
  }

  const now = Date.now();
  if (
    deliveries.some(
      (delivery) =>
        delivery.status === 'running' &&
        now - new Date(delivery.updatedAt).getTime() < WEBHOOK_DELIVERY_LEASE_MS
    )
  ) {
    return 'active';
  }

  if (
    deliveries.length === 0 &&
    now - new Date(receipt.createdAt).getTime() < WEBHOOK_DELIVERY_LEASE_MS
  ) {
    return 'active';
  }

  return 'retry';
}

async function assertWebhookSourceAllowed(
  request: Request,
  allowedIPs: string[] | undefined,
  resolver: PlugFnRouterOptions['resolveWebhookClientIp']
): Promise<void> {
  if (!allowedIPs || allowedIPs.length === 0) {
    return;
  }

  const clientIp = await resolver?.(request);
  if (clientIp && allowedIPs.includes(clientIp)) {
    return;
  }

  throw {
    code: 'WEBHOOK_SOURCE_DENIED',
    message: 'webhook source is not allowed',
    status: 403,
    retryable: false,
  };
}

async function createFailedWebhookReceipt(
  ctx: PlugFnContext,
  provider: string,
  event: string,
  headers: Record<string, string> | undefined,
  payloadHash: string | undefined,
  idempotencyKey: string | undefined,
  error: unknown
): Promise<void> {
  if (!payloadHash) {
    return;
  }

  try {
    await ctx.plugFn.runtime.webhooks.createReceipt({
      provider,
      event,
      payloadHash,
      idempotencyKey,
      headersRedacted: headers ? redactHeaders(headers) : undefined,
      verificationStatus: 'failed',
      metadata: {
        error: error instanceof Error ? error.message : 'webhook verification failed',
      },
    });
  } catch {
    // A failed receipt is observability best-effort; the original deterministic error is returned.
  }
}

function inferWebhookEvent(
  provider: string,
  headers: Record<string, string>,
  rawBody?: Uint8Array,
  triggers: Record<string, unknown> = {}
): string {
  if (provider === 'github') {
    const family = headers['x-github-event'] || 'event';
    const action = readWebhookAction(rawBody);
    const actionEvent = action ? `${family}.${action}` : undefined;
    return actionEvent && actionEvent in triggers ? actionEvent : family;
  }
  if (provider === 'linear') {
    const family = (headers['linear-event'] || headers['x-linear-event'] || 'event')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const action = readWebhookAction(rawBody)?.trim().toLowerCase();
    const candidate =
      family === 'issue' && action === 'create'
        ? 'issue.created'
        : family === 'issue' && action === 'update'
          ? 'issue.updated'
          : (family === 'comment' || family === 'issue_comment') && action === 'create'
            ? 'issue_comment.created'
            : undefined;
    return candidate && candidate in triggers ? candidate : family;
  }
  if (provider === 'stripe') {
    return readWebhookStringField(rawBody, 'type') || 'event';
  }
  if (provider === 'gmail' || provider === 'google') {
    const resourceState = headers['x-goog-resource-state'];
    if (resourceState) {
      return resourceState;
    }
    if ('mail.update' in triggers && isGmailPubSubEnvelope(rawBody)) {
      return 'mail.update';
    }
    return 'message';
  }
  return headers['x-plugfn-event'] || 'event';
}

function isGmailPubSubEnvelope(rawBody?: Uint8Array): boolean {
  if (!rawBody || rawBody.byteLength === 0) {
    return false;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
    const message = payload.message;
    return (
      typeof message === 'object' &&
      message !== null &&
      typeof (message as Record<string, unknown>).data === 'string'
    );
  } catch {
    return false;
  }
}

function readWebhookStringField(
  rawBody: Uint8Array | undefined,
  field: string
): string | undefined {
  if (!rawBody || rawBody.byteLength === 0) {
    return undefined;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
    return typeof payload[field] === 'string' && payload[field].length > 0
      ? payload[field]
      : undefined;
  } catch {
    return undefined;
  }
}

function readWebhookAction(rawBody?: Uint8Array): string | undefined {
  return readWebhookStringField(rawBody, 'action');
}

function readWebhookIdempotencyKey(
  provider: string,
  headers: Record<string, string>,
  rawBody?: Uint8Array
): string | undefined {
  if (provider === 'stripe') {
    const eventId = readWebhookStringField(rawBody, 'id');
    if (eventId) {
      return eventId;
    }
  }

  return (
    headers['x-plugfn-delivery'] ||
    headers['x-github-delivery'] ||
    headers['linear-delivery'] ||
    headers['x-linear-delivery'] ||
    headers['x-goog-message-number'] ||
    headers[`${provider}-delivery`]
  );
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      key.includes('authorization') ||
      key.includes('signature') ||
      key.includes('secret') ||
      key.includes('token')
    ) {
      redacted[key] = '[redacted]';
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

async function parseJsonBody(
  request: Request,
  options: ParseJsonBodyOptions = {}
): Promise<Record<string, any>> {
  return parseJsonText(await readRequestText(request, options));
}

async function readRequestBytes(
  request: Request,
  options: ParseJsonBodyOptions = {}
): Promise<Uint8Array> {
  const maxBytes = options.maxBytes;
  if (maxBytes !== undefined) {
    const contentLength = parseContentLength(request.headers.get('content-length'));
    if (contentLength !== undefined && contentLength > maxBytes) {
      throw payloadTooLargeError(maxBytes);
    }
  }

  try {
    const body = new Uint8Array(await request.arrayBuffer());
    if (maxBytes !== undefined && body.byteLength > maxBytes) {
      throw payloadTooLargeError(maxBytes);
    }
    return body;
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in (error as any) &&
      'status' in (error as any)
    ) {
      throw error;
    }
    return new Uint8Array();
  }
}

async function readRequestText(
  request: Request,
  options: ParseJsonBodyOptions = {}
): Promise<string> {
  const body = await readRequestBytes(request, options);
  return new TextDecoder().decode(body);
}

function parseJsonText(body: string): Record<string, any> {
  try {
    if (!body) {
      return {};
    }

    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as Record<string, any>;
  } catch {
    return {};
  }
}

function assertIdentityMatches(body: Record<string, any>, authContext: RouteAuthContext): void {
  const bodyUserId = asOptionalString(body.userId);
  if (bodyUserId && bodyUserId !== authContext.userId) {
    throw identityMismatchError();
  }

  const bodyTenantId = asOptionalString(body.tenantId);
  if (bodyTenantId && authContext.tenantId && bodyTenantId !== authContext.tenantId) {
    throw identityMismatchError();
  }

  const bodyOrganizationId = asOptionalString(body.organizationId);
  if (
    bodyOrganizationId &&
    authContext.organizationId &&
    bodyOrganizationId !== authContext.organizationId
  ) {
    throw identityMismatchError();
  }

  const owner = asConnectionOwner(body.owner);
  if (!owner) {
    return;
  }

  assertOwnerMatchesAuthContext(owner, authContext);
}

function assertOwnerMatchesAuthContext(
  owner: PlugFnConnectionOwner,
  authContext: RouteAuthContext
): void {
  if (owner.tenantId && authContext.tenantId && owner.tenantId !== authContext.tenantId) {
    throw identityMismatchError();
  }

  if (owner.kind === 'user' && owner.userId !== authContext.userId) {
    throw identityMismatchError();
  }

  if (
    owner.kind === 'organization' &&
    owner.installedByUserId !== authContext.userId
  ) {
    throw identityMismatchError();
  }

  if (
    owner.kind === 'organization' &&
    (!authContext.organizationId || owner.organizationId !== authContext.organizationId)
  ) {
    throw identityMismatchError();
  }

  if (
    owner.kind === 'delegated' &&
    owner.installedByUserId !== authContext.userId &&
    owner.delegatedToUserId !== authContext.userId
  ) {
    throw identityMismatchError();
  }

  if (
    'organizationId' in owner &&
    authContext.organizationId &&
    owner.organizationId !== authContext.organizationId
  ) {
    throw identityMismatchError();
  }
}

function identityMismatchError(): SuperfunctionError {
  return new SuperfunctionError({
    code: 'TENANT_ACCESS_DENIED',
    message: 'identity mismatch',
    status: 403,
    retryable: false,
  });
}

function assertIdentityMatchesQuery(
  query: URLSearchParams,
  authContext: RouteAuthContext
): void {
  assertIdentityMatches(
    {
      userId: query.get('user') ?? query.get('uid') ?? Object.fromEntries(query).userId,
      tenantId: Object.fromEntries(query).tenantId,
      organizationId: Object.fromEntries(query).organizationId,
    },
    authContext
  );
}

function normalizeAuthContext(principal: PlugFnPrincipal | AuthSession | null): RouteAuthContext | null {
  if (!principal) {
    return null;
  }

  if ('subject' in principal) {
    return {
      userId: principal.subject.actorId,
      tenantId: principal.subject.tenantId,
      organizationId: asOptionalString(principal.metadata?.organizationId),
      roles: principal.resourceIds,
      grants: principal.scopes,
    };
  }

  return {
    userId: principal.userId,
    tenantId: principal.tenantId,
    organizationId:
      asOptionalString(principal.organizationId) ??
      asOptionalString(principal.metadata?.organizationId),
    roles: principal.roles,
    grants: principal.grants,
  };
}

function assertProviderConfigured(ctx: PlugFnContext, provider: string): void {
  if (!ctx.plugFn.providers.get(provider)) {
    throw {
      code: 'PROVIDER_NOT_REGISTERED',
      message: `provider ${provider} is not registered`,
      status: 404,
    };
  }

  if (!(provider in ctx.plugFn.config.integrations)) {
    throw {
      code: 'PROVIDER_NOT_CONFIGURED',
      message: `provider ${provider} is not configured`,
      status: 400,
    };
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value.filter((entry): entry is string => {
    return typeof entry === 'string' && entry.length > 0;
  });

  return result.length > 0 ? result : undefined;
}

function asConnectionOwner(value: unknown): PlugFnConnectionOwner | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (value.kind === 'user' && typeof value.userId === 'string' && value.userId.length > 0) {
    return {
      kind: 'user',
      userId: value.userId,
      tenantId: asOptionalString(value.tenantId),
    };
  }

  if (
    value.kind === 'organization' &&
    typeof value.organizationId === 'string' &&
    typeof value.installedByUserId === 'string'
  ) {
    return {
      kind: 'organization',
      organizationId: value.organizationId,
      installedByUserId: value.installedByUserId,
      tenantId: asOptionalString(value.tenantId),
    };
  }

  if (
    value.kind === 'delegated' &&
    typeof value.organizationId === 'string' &&
    typeof value.installedByUserId === 'string' &&
    typeof value.delegatedToUserId === 'string' &&
    Array.isArray(value.grants)
  ) {
    return {
      kind: 'delegated',
      organizationId: value.organizationId,
      installedByUserId: value.installedByUserId,
      delegatedToUserId: value.delegatedToUserId,
      grants: value.grants.filter((grant): grant is string => typeof grant === 'string'),
      tenantId: asOptionalString(value.tenantId),
    };
  }

  return undefined;
}

function toDeterministicError(error: unknown): DeterministicError {
  if (error instanceof SuperfunctionError) {
    const superfunctionError = error as SuperfunctionError;
    return {
      code: superfunctionError.code,
      message: superfunctionError.message,
      status: superfunctionError.status,
      retryable: superfunctionError.retryable,
      details: superfunctionError.details ?? {},
    };
  }

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof (error as any).code === 'string' &&
    typeof (error as any).message === 'string'
  ) {
    const status =
      'status' in (error as any) && typeof (error as any).status === 'number'
        ? (error as any).status
        : 400;
    const retryable =
      'retryable' in (error as any) && typeof (error as any).retryable === 'boolean'
        ? (error as any).retryable
        : isRetryableStatus(status);
    const details =
      'details' in (error as any) && isPlainObject((error as any).details)
        ? ((error as any).details as Record<string, unknown>)
        : {};

    return {
      code: (error as any).code,
      message: (error as any).message,
      status,
      retryable,
      details,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'VALIDATION_ERROR',
      message: error.message,
      status: 400,
      retryable: false,
      details: {},
    };
  }

  return {
    code: 'VALIDATION_ERROR',
    message: 'request failed',
    status: 400,
    retryable: false,
    details: {},
  };
}

function oauthCallbackResponse(
  ctx: PlugFnContext,
  result: HandleCallbackResult,
  routerOptions: PlugFnRouterOptions
): Response {
  const { connection, returnTo } = result;
  const redirectUrl = resolveReturnToRedirect(
    returnTo ?? routerOptions.defaultReturnTo,
    ctx.plugFn.config.baseUrl
  );

  if (redirectUrl) {
    return Response.redirect(redirectUrl, 302);
  }

  return successResponse({
    connection: {
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
    },
  });
}

function resolveReturnToRedirect(returnTo: string | undefined, baseUrl: string): string | null {
  if (!returnTo) {
    return null;
  }

  const trimmed = returnTo.trim();
  if (!trimmed || trimmed.startsWith('//')) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return `${base.origin}${trimmed}`;
    } catch {
      return null;
    }
  }

  let target: URL;
  try {
    target = new URL(trimmed);
  } catch {
    return null;
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return null;
  }

  try {
    const base = new URL(baseUrl);
    if (target.origin === base.origin) {
      return target.toString();
    }
  } catch {
    return null;
  }

  if (/^(localhost|127\.0\.0\.1)$/i.test(target.hostname)) {
    return target.toString();
  }

  return null;
}

function successResponse(data: Record<string, unknown>): Response {
  const envelope = envelopeOk(data) as PlugFnApiEnvelope<Record<string, unknown>>;
  envelope.meta = createResponseMeta(envelope.meta?.timestamp);
  return Response.json(envelope);
}

function errorResponse(error: DeterministicError): Response {
  const details = isPlainObject(error.details) ? error.details : {};
  const envelope = envelopeErr({
    code: error.code,
    message: error.message,
    status: error.status,
    retryable: error.retryable,
    details,
  }) as PlugFnApiEnvelope;
  envelope.meta = createResponseMeta(envelope.meta?.timestamp);
  return Response.json(
    envelope,
    { status: error.status }
  );
}

function createResponseMeta(timestamp = new Date().toISOString()): PlugFnResponseMeta {
  return {
    requestId: `req_${randomBytes(12).toString('hex')}`,
    timestamp,
  };
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function payloadTooLargeError(maxBytes: number): DeterministicError {
  return {
    code: 'VALIDATION_ERROR',
    message: 'webhook payload exceeds configured max size',
    status: 413,
    retryable: false,
    details: {
      maxBytes,
    },
  };
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
