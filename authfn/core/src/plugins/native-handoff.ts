import { randomBytes } from 'node:crypto';
import { NotFoundError } from '@superfunctions/db';
import type { Route } from '@superfunctions/http';
import type { NativeHandoffPluginConfig } from '../plugin-types.js';
import type {
  AuthFnNativeHandoffCodeRecord,
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnSchemaDefinition,
  AuthFnSession,
  AuthFnSessionRecord
} from '../types.js';
import { resolveCookiePolicy } from '../core/cookies.js';
import {
  assertValidCsrf,
  authenticateSessionToken,
  hashSecret,
  issueSession,
  requireCookieSession
} from '../core/sessions.js';
import {
  AuthFnConflictError,
  AuthFnRegionMismatchError,
  AuthFnSessionRevokedError,
  AuthFnUnauthenticatedError,
  AuthFnValidationError
} from '../core/errors.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';
import { resolveRuntime } from '../core/runtime.js';
import { findUserById } from '../core/users.js';
import { issueSessionCookies } from '../core/cookies.js';
import { createAuthFnRouteMeta, readOptionalJson } from '../http/router.js';
import { jsonSuccess } from '../http/envelopes.js';

const DEFAULT_CODE_TTL_SECONDS = 60;

export function authFnNativeHandoffPlugin(config: NativeHandoffPluginConfig = {}): AuthFnPlugin {
  return {
    name: 'nativeHandoff',
    schema: () => config.schema ?? createNativeHandoffSchema(),
    routes: (ctx) => createNativeHandoffRoutes(ctx, config)
  };
}

function createNativeHandoffSchema(): AuthFnSchemaDefinition['schemas'] {
  return [
    {
      modelName: 'native_handoff_codes',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        codeHash: { type: 'string', required: true, fieldName: 'code_hash' },
        sourceSessionId: { type: 'string', required: true, fieldName: 'source_session_id' },
        target: { type: 'string', required: true, fieldName: 'target' },
        regionId: { type: 'string', required: true, fieldName: 'region_id' },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        expiresAt: { type: 'date', required: true, fieldName: 'expires_at' },
        consumedAt: { type: 'date', required: false, fieldName: 'consumed_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        metadata: { type: 'json', required: false, fieldName: 'metadata' }
      },
      indexes: [
        {
          name: 'idx_authfn_native_handoff_code_hash',
          fields: ['codeHash'],
          unique: true
        },
        {
          name: 'idx_authfn_native_handoff_source_session_id',
          fields: ['sourceSessionId']
        },
        {
          name: 'idx_authfn_native_handoff_expires_at',
          fields: ['expiresAt']
        }
      ]
    }
  ];
}

function createNativeHandoffRoutes(
  ctx: AuthFnPluginRuntimeContext,
  pluginConfig: NativeHandoffPluginConfig
): Route[] {
  return [
    {
      method: 'POST',
      path: '/handoff/native/start',
      meta: createAuthFnRouteMeta('startNativeHandoff', 'Create a one-time native handoff code', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request) => {
        const source = await requireNativeHandoffSource(ctx, request);
        const code = await createHandoffCode(ctx, pluginConfig, {
          request,
          sourceSessionId: source.sessionId,
          userId: source.userId,
          regionId: source.regionId,
          target: 'native',
          metadata: {
            source: source.source
          }
        });

        return jsonSuccess(request, {
          code: code.code,
          regionId: code.record.regionId,
          expiresAt: code.record.expiresAt.toISOString()
        });
      }
    },
    {
      method: 'POST',
      path: '/handoff/native/exchange',
      meta: createAuthFnRouteMeta('exchangeNativeHandoff', 'Exchange a native handoff code for a bearer session', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await readOptionalJson<{
          code?: string;
          device?: Record<string, unknown>;
        }>(request);
        const consumed = await consumeHandoffCode(ctx, request, body.code, 'native');
        const sourceSession = await findSessionRecord(ctx, consumed.record.sourceSessionId);
        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: consumed.record.userId,
          primaryEmail: consumed.user.primaryEmail,
          regionId: consumed.record.regionId,
          methods: sourceSession.methods,
          metadata: {
            sourceSessionId: consumed.record.sourceSessionId,
            handoffTarget: 'native',
            device: body.device
          }
        });

        await emitAuthEvent(ctx.config, {
          type: 'authfn.handoff.exchanged',
          requestId: eventRequestId(request),
          actorId: consumed.record.userId,
          userId: consumed.record.userId,
          sessionId: issued.session.id,
          regionId: consumed.record.regionId,
          outcome: 'native-exchanged'
        });

        return jsonSuccess(request, {
          session: issued.session,
          token: issued.sessionToken
        });
      }
    },
    {
      method: 'POST',
      path: '/handoff/web/start',
      meta: createAuthFnRouteMeta('startWebHandoff', 'Create a one-time WebView handoff code', {
        mode: 'bearer'
      }),
      handler: async (request) => {
        const session = await requireBearerSession(ctx, request);
        const body = await readOptionalJson<{
          returnTo?: string;
        }>(request);
        const code = await createHandoffCode(ctx, pluginConfig, {
          request,
          sourceSessionId: session.record.id,
          userId: session.record.userId,
          regionId: session.session.regionId ?? (await resolveRuntime(ctx.config, request)).regionId,
          target: 'web',
          metadata: {
            source: 'native',
            returnTo: sanitizeReturnTo(body.returnTo)
          }
        });

        const url = new URL(request.url);
        url.pathname = `${ctx.basePath.replace(/\/$/, '')}/handoff/web/consume`;
        url.search = '';
        url.searchParams.set('code', code.code);

        return jsonSuccess(request, {
          consumeUrl: url.toString(),
          code: code.code,
          expiresAt: code.record.expiresAt.toISOString()
        });
      }
    },
    {
      method: 'GET',
      path: '/handoff/web/consume',
      meta: createAuthFnRouteMeta('consumeWebHandoff', 'Consume a WebView handoff code and set session cookies', {
        mode: 'none'
      }),
      handler: async (request) => {
        const code = new URL(request.url).searchParams.get('code');
        const consumed = await consumeHandoffCode(ctx, request, code, 'web');
        const sourceSession = await findSessionRecord(ctx, consumed.record.sourceSessionId);
        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: consumed.record.userId,
          primaryEmail: consumed.user.primaryEmail,
          regionId: consumed.record.regionId,
          methods: sourceSession.methods,
          metadata: {
            sourceSessionId: consumed.record.sourceSessionId,
            handoffTarget: 'web'
          }
        });
        const runtime = issued.runtime ?? await resolveRuntime(ctx.config, request);
        const cookiePolicy = issued.cookiePolicy ?? resolveCookiePolicy(ctx.config, request, runtime);
        const cookies = issueSessionCookies(cookiePolicy, issued.sessionToken, issued.csrfToken);
        const headers = new Headers({
          location: sanitizeReturnTo(consumed.record.metadata?.returnTo)
        });
        headers.append('set-cookie', cookies.sessionCookie);
        headers.append('set-cookie', cookies.csrfCookie);

        await emitAuthEvent(ctx.config, {
          type: 'authfn.handoff.exchanged',
          requestId: eventRequestId(request),
          actorId: consumed.record.userId,
          userId: consumed.record.userId,
          sessionId: issued.session.id,
          regionId: consumed.record.regionId,
          outcome: 'web-consumed'
        });

        return new Response(null, {
          status: 302,
          headers
        });
      }
    }
  ];
}

async function createHandoffCode(
  ctx: AuthFnPluginRuntimeContext,
  pluginConfig: NativeHandoffPluginConfig,
  input: {
    request: Request;
    sourceSessionId: string;
    userId: string;
    regionId?: string;
    target: 'native' | 'web';
    metadata?: Record<string, unknown>;
  }
): Promise<{ code: string; record: AuthFnNativeHandoffCodeRecord }> {
  if (!input.regionId) {
    throw new AuthFnValidationError('A region id is required to create a handoff code');
  }

  const now = pluginConfig.now?.() ?? new Date();
  const code = createOpaqueCode();
  const record: AuthFnNativeHandoffCodeRecord = {
    id: createIdentifier('handoff'),
    codeHash: hashSecret(code),
    sourceSessionId: input.sourceSessionId,
    target: input.target,
    regionId: input.regionId,
    userId: input.userId,
    expiresAt: new Date(now.getTime() + ((pluginConfig.codeTtlSeconds ?? DEFAULT_CODE_TTL_SECONDS) * 1000)),
    consumedAt: null,
    createdAt: now,
    metadata: input.metadata
  };

  await ctx.config.database.create<AuthFnNativeHandoffCodeRecord>({
    model: 'native_handoff_codes',
    data: record,
    namespace: ctx.namespace
  });

  await emitAuthEvent(ctx.config, {
    type: 'authfn.handoff.started',
    requestId: eventRequestId(input.request),
    actorId: input.userId,
    userId: input.userId,
    sessionId: input.sourceSessionId,
    regionId: input.regionId,
    outcome: input.target
  });

  return {
    code,
    record
  };
}

async function requireNativeHandoffSource(
  ctx: AuthFnPluginRuntimeContext,
  request: Request
): Promise<{
  sessionId: string;
  userId: string;
  regionId: string | undefined;
  source: 'web' | 'web-bearer';
}> {
  if (readBearerToken(request)) {
    const bearer = await requireBearerSession(ctx, request);
    return {
      sessionId: bearer.record.id,
      userId: bearer.record.userId,
      regionId: bearer.session.regionId ?? (await resolveRuntime(ctx.config, request)).regionId,
      source: 'web-bearer'
    };
  }

  const state = await requireCookieSession(ctx.config, request);
  assertValidCsrf(request, state);
  return {
    sessionId: state.session.id,
    userId: state.user.id,
    regionId: state.session.regionId ?? state.runtime.regionId,
    source: 'web'
  };
}

async function consumeHandoffCode(
  ctx: AuthFnPluginRuntimeContext,
  request: Request,
  code: string | null | undefined,
  target: 'native' | 'web'
): Promise<{ record: AuthFnNativeHandoffCodeRecord; user: { id: string; primaryEmail?: string } }> {
  if (!code) {
    await emitHandoffFailure(ctx, request, target, 'missing-code');
    throw new AuthFnValidationError('A handoff code is required');
  }

  const record = await ctx.config.database.findOne<AuthFnNativeHandoffCodeRecord>({
    model: 'native_handoff_codes',
    where: [{ field: 'codeHash', operator: 'eq', value: hashSecret(code) }],
    namespace: ctx.namespace
  });
  if (!record || record.target !== target) {
    await emitHandoffFailure(ctx, request, target, 'invalid-code');
    throw new AuthFnValidationError('Handoff code is invalid');
  }

  const runtime = await resolveRuntime(ctx.config, request);
  if (runtime.regionId && record.regionId !== runtime.regionId) {
    await emitHandoffFailure(ctx, request, target, 'wrong-region', record);
    throw new AuthFnRegionMismatchError('Handoff code belongs to a different region', {
      regionId: record.regionId
    });
  }

  if (record.consumedAt) {
    await emitHandoffFailure(ctx, request, target, 'replayed', record);
    throw new AuthFnConflictError('Handoff code has already been consumed', {
      handoffId: record.id
    });
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await emitHandoffFailure(ctx, request, target, 'expired', record);
    throw new AuthFnValidationError('Handoff code has expired', {
      handoffId: record.id
    });
  }

  const sourceSession = await findSessionRecord(ctx, record.sourceSessionId);
  if (sourceSession.revokedAt) {
    await emitHandoffFailure(ctx, request, target, 'revoked-source', record);
    throw new AuthFnSessionRevokedError('Source session has been revoked');
  }

  const user = await findUserById(ctx.config, record.userId);
  if (!user) {
    await emitHandoffFailure(ctx, request, target, 'missing-user', record);
    throw new AuthFnUnauthenticatedError('Handoff user no longer exists');
  }

  const consumedAt = new Date();
  const consumedRecord = await consumeHandoffRecordAtomically(ctx, request, target, record, consumedAt);

  return {
    record: consumedRecord,
    user
  };
}

async function consumeHandoffRecordAtomically(
  ctx: AuthFnPluginRuntimeContext,
  request: Request,
  target: 'native' | 'web',
  record: AuthFnNativeHandoffCodeRecord,
  consumedAt: Date
): Promise<AuthFnNativeHandoffCodeRecord> {
  try {
    return await ctx.config.database.update<AuthFnNativeHandoffCodeRecord>({
      model: 'native_handoff_codes',
      where: [
        { field: 'id', operator: 'eq', value: record.id },
        { field: 'consumedAt', operator: 'eq', value: null }
      ],
      data: {
        consumedAt
      },
      namespace: ctx.namespace
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      await emitHandoffFailure(ctx, request, target, 'replayed', record);
      throw new AuthFnConflictError('Handoff code has already been consumed', {
        handoffId: record.id
      });
    }
    throw error;
  }
}

async function requireBearerSession(
  ctx: AuthFnPluginRuntimeContext,
  request: Request
): Promise<{ session: AuthFnSession; record: AuthFnSessionRecord }> {
  const token = readBearerToken(request);
  if (!token) {
    throw new AuthFnUnauthenticatedError('Bearer session is required');
  }

  const session = await authenticateSessionToken(ctx.config, token, request);
  if (!session) {
    throw new AuthFnUnauthenticatedError('Bearer session is invalid');
  }

  return {
    session,
    record: await findSessionRecord(ctx, session.id)
  };
}

async function findSessionRecord(
  ctx: Pick<AuthFnPluginRuntimeContext, 'config' | 'namespace'>,
  sessionId: string
): Promise<AuthFnSessionRecord> {
  const record = await ctx.config.database.findOne<AuthFnSessionRecord>({
    model: 'sessions',
    where: [{ field: 'id', operator: 'eq', value: sessionId }],
    namespace: ctx.namespace
  });
  if (!record) {
    throw new AuthFnUnauthenticatedError('Source session was not found');
  }
  return record;
}

async function emitHandoffFailure(
  ctx: AuthFnPluginRuntimeContext,
  request: Request,
  target: 'native' | 'web',
  outcome: string,
  record?: AuthFnNativeHandoffCodeRecord
): Promise<void> {
  await emitAuthEvent(ctx.config, {
    type: 'authfn.handoff.failed',
    requestId: eventRequestId(request),
    actorId: record?.userId,
    userId: record?.userId,
    sessionId: record?.sourceSessionId,
    regionId: record?.regionId,
    outcome,
    metadata: {
      target
    }
  });
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof NotFoundError
    || Boolean(
      error
        && typeof error === 'object'
        && (error as { name?: unknown }).name === 'NotFoundError'
    );
}

function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '/';
  }
  if (value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  try {
    const url = new URL(value);
    const relative = `${url.pathname}${url.search}${url.hash}` || '/';
    return relative.startsWith('/') && !relative.startsWith('//') ? relative : '/';
  } catch {
    return '/';
  }
}

function createOpaqueCode(): string {
  return `hf_${randomBytes(24).toString('base64url')}`;
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
