import { wrapWithSchema } from '@superfunctions/db';
import { createRouter, type Route, type Router } from '@superfunctions/http';
import {
  AuthFnAdminConfigError,
  AuthFnAdminUnauthorizedError,
  AuthFnValidationError,
  getSchema,
  type AuthFnAccountDeletionResult,
  type AuthFnRuntimeConfig,
  type AuthFnHooks
} from 'authfn';
import { createPluginRunner } from 'authfn/plugin-runner';
import {
  deleteAuthFnAdminUserById,
  deleteAuthFnAdminUsersByEmail,
  listAuthFnAdminUsers,
  type AuthFnAdminDeleteUsersByEmailResult,
  type AuthFnAdminListUsersResult
} from 'authfn/core/admin-users';
import { jsonError, jsonSuccess } from 'authfn/http/envelopes';

export type AuthFnAdminAction = 'users.list' | 'users.delete';

export interface AuthFnAdminAuthorizationContext {
  request: Request;
  action: AuthFnAdminAction;
}

export interface AuthFnAdminAuthorizationInput {
  operationId: string;
  params?: Record<string, string>;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

export type AuthFnAdminAuthorizationResult =
  | boolean
  | {
      allowed: boolean;
      actorId?: string;
      metadata?: Record<string, unknown>;
    };

export type AuthFnAdminAuthorize = (
  ctx: AuthFnAdminAuthorizationContext,
  input: AuthFnAdminAuthorizationInput
) => Promise<AuthFnAdminAuthorizationResult> | AuthFnAdminAuthorizationResult;

export interface AuthFnAdminOptions {
  authFnConfig: AuthFnRuntimeConfig;
  authorize: AuthFnAdminAuthorize;
  basePath?: string;
}

export interface AuthFnAdminInstance {
  router: Router;
  routes: Route[];
}

export interface StaticAdminKeyAuthorizerOptions {
  token: string;
  actorId?: string;
  headerName?: string;
}

interface PreparedAuthFnAdmin {
  config: AuthFnRuntimeConfig;
  hooks: Partial<AuthFnHooks>;
  authorize: AuthFnAdminAuthorize;
}

interface AuthorizedAdminActor {
  actorId?: string;
  metadata?: Record<string, unknown>;
}

export function createAuthFnAdmin(options: AuthFnAdminOptions): AuthFnAdminInstance {
  const prepared = prepareAuthFnAdmin(options);
  const routes = createPreparedAuthFnAdminRoutes(prepared);

  return {
    routes,
    router: createRouter({
      basePath: options.basePath ?? '/admin',
      routes,
      onError: (error, request) => jsonError(request, error)
    })
  };
}

export function createAuthFnAdminRouter(options: AuthFnAdminOptions): Router {
  return createAuthFnAdmin(options).router;
}

export function createAuthFnAdminRoutes(options: AuthFnAdminOptions): Route[] {
  return createPreparedAuthFnAdminRoutes(prepareAuthFnAdmin(options));
}

export function createStaticAdminKeyAuthorizer(
  options: StaticAdminKeyAuthorizerOptions
): AuthFnAdminAuthorize {
  const expectedToken = options.token.trim();
  if (!expectedToken) {
    throw new AuthFnAdminConfigError('Static admin key authorizer requires a token');
  }

  const headerName = options.headerName ?? 'authorization';
  const actorId = options.actorId ?? 'authfn-admin-key';

  return ({ request }) => {
    const headerValue = request.headers.get(headerName);
    const token = headerValue?.replace(/^Bearer\s+/i, '').trim();
    return {
      allowed: Boolean(token && safeEqual(token, expectedToken)),
      actorId
    };
  };
}

function prepareAuthFnAdmin(options: AuthFnAdminOptions): PreparedAuthFnAdmin {
  if (typeof options.authorize !== 'function') {
    throw new AuthFnAdminConfigError('AuthFn admin routes require an authorize hook');
  }

  const schema = getSchema(options.authFnConfig);
  const config: AuthFnRuntimeConfig = {
    ...options.authFnConfig,
    database: wrapWithSchema(options.authFnConfig.database, schema)
  };
  const runner = createPluginRunner(config);

  return {
    config,
    hooks: runner.hooks,
    authorize: options.authorize
  };
}

function createPreparedAuthFnAdminRoutes(admin: PreparedAuthFnAdmin): Route[] {
  return [
    {
      method: 'GET',
      path: '/users',
      meta: createAdminRouteMeta('listAuthFnAdminUsers', 'List AuthFn users'),
      handler: (request, context) =>
        withAdminEnvelope(request, async () => {
          const input = parseListUsersInput(context.query);
          await authorizeAdmin(admin, request, 'users.list', {
            operationId: 'listAuthFnAdminUsers',
            query: queryToObject(context.query)
          });

          return listAuthFnAdminUsers(admin.config, input);
        })
    },
    {
      method: 'DELETE',
      path: '/users/:id',
      meta: createAdminRouteMeta('deleteAuthFnAdminUserById', 'Delete an AuthFn user by id'),
      handler: (request, context) =>
        withAdminEnvelope(request, async () => {
          const userId = context.params.id?.trim();
          if (!userId) {
            throw new AuthFnValidationError('User id is required', {
              field: 'id'
            });
          }

          const authorization = await authorizeAdmin(admin, request, 'users.delete', {
            operationId: 'deleteAuthFnAdminUserById',
            params: { id: userId }
          });

          return deleteAuthFnAdminUserById(admin.config, admin.hooks, {
            userId,
            request,
            actorId: authorization.actorId
          });
        })
    },
    {
      method: 'DELETE',
      path: '/users/by-email/:email',
      meta: createAdminRouteMeta('deleteAuthFnAdminUsersByEmail', 'Delete AuthFn user by email'),
      handler: (request, context) =>
        withAdminEnvelope(request, async () => {
          const email = context.params.email?.trim();
          if (!email) {
            throw new AuthFnValidationError('Email is required', {
              field: 'email'
            });
          }

          const body = await parseOptionalJsonBody(request);
          const deleteAllMatches = readDeleteAllMatches(body);
          const authorization = await authorizeAdmin(admin, request, 'users.delete', {
            operationId: 'deleteAuthFnAdminUsersByEmail',
            params: { email },
            body: deleteAllMatches === undefined ? undefined : { deleteAllMatches }
          });

          return deleteAuthFnAdminUsersByEmail(admin.config, admin.hooks, {
            email,
            deleteAllMatches,
            request,
            actorId: authorization.actorId
          });
        })
    }
  ];
}

async function authorizeAdmin(
  admin: PreparedAuthFnAdmin,
  request: Request,
  action: AuthFnAdminAction,
  input: AuthFnAdminAuthorizationInput
): Promise<AuthorizedAdminActor> {
  const result = await admin.authorize({ request, action }, input);
  const allowed = typeof result === 'boolean' ? result : result.allowed;
  if (!allowed) {
    throw new AuthFnAdminUnauthorizedError();
  }

  return typeof result === 'boolean'
    ? {}
    : {
        actorId: result.actorId,
        metadata: result.metadata
      };
}

async function withAdminEnvelope<TData>(
  request: Request,
  operation: () => Promise<TData>
): Promise<Response> {
  try {
    return jsonSuccess(request, await operation());
  } catch (error) {
    return jsonError(request, error);
  }
}

function parseListUsersInput(query: URLSearchParams): {
  limit?: number;
  cursor?: string;
  email?: string;
  regionId?: string;
  direction?: 'asc' | 'desc';
} {
  const direction = query.get('direction') ?? undefined;
  if (direction !== undefined && direction !== 'asc' && direction !== 'desc') {
    throw new AuthFnValidationError('direction must be asc or desc', {
      field: 'direction'
    });
  }

  return {
    limit: parseOptionalInteger(query.get('limit'), 'limit'),
    cursor: query.get('cursor') ?? undefined,
    email: query.get('email') ?? undefined,
    regionId: query.get('regionId') ?? undefined,
    direction
  };
}

function parseOptionalInteger(value: string | null, field: string): number | undefined {
  if (value === null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new AuthFnValidationError(`${field} must be an integer`, {
      field
    });
  }

  return parsed;
}

async function parseOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AuthFnValidationError('Invalid JSON body', {
      field: 'body'
    });
  }
}

function readDeleteAllMatches(body: unknown): boolean | undefined {
  if (body === undefined) {
    return undefined;
  }

  if (!isRecord(body) || (
    body.deleteAllMatches !== undefined
    && typeof body.deleteAllMatches !== 'boolean'
  )) {
    throw new AuthFnValidationError('deleteAllMatches must be a boolean when provided', {
      field: 'deleteAllMatches'
    });
  }

  return body.deleteAllMatches;
}

function createAdminRouteMeta(operationId: string, summary: string) {
  return {
    auth: {
      mode: 'bearer' as const,
      scopes: ['authfn:admin']
    },
    openapi: {
      include: true,
      operationId,
      summary,
      tags: ['authfn-admin']
    }
  };
}

function queryToObject(query: URLSearchParams): Record<string, string | undefined> {
  return {
    limit: query.get('limit') ?? undefined,
    cursor: query.get('cursor') ?? undefined,
    email: query.get('email') ?? undefined,
    regionId: query.get('regionId') ?? undefined,
    direction: query.get('direction') ?? undefined
  };
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);

  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export type {
  AuthFnAccountDeletionResult,
  AuthFnAdminDeleteUsersByEmailResult,
  AuthFnAdminListUsersResult
};
