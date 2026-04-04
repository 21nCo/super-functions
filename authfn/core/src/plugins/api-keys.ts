import type { Route } from '@superfunctions/http';
import type { ApiKeyPluginConfig } from '../plugin-types.js';
import type { AuthFnPlugin, AuthFnPluginRuntimeContext, AuthFnSchemaDefinition } from '../types.js';
import { createApiKey, listApiKeysForUser, revokeApiKeyById } from '../core/api-keys.js';
import { assertValidCsrf, requireCookieSession } from '../core/sessions.js';
import { createAuthFnRouteMeta } from '../http/router.js';
import { jsonSuccess } from '../http/envelopes.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';

export function authFnApiKeyPlugin(config: ApiKeyPluginConfig = {}): AuthFnPlugin {
  return {
    name: 'apiKey',
    schema: () => config.schema ?? createApiKeySchema(),
    routes: (ctx) => createApiKeyRoutes(ctx, config)
  };
}

function createApiKeySchema(): AuthFnSchemaDefinition['schemas'] {
  return [
    {
      modelName: 'api_keys',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        userId: { type: 'string', required: false, fieldName: 'user_id' },
        name: { type: 'string', required: false, fieldName: 'name' },
        secretHash: { type: 'string', required: true, fieldName: 'secret_hash' },
        scopes: { type: 'json', required: false, fieldName: 'scopes' },
        metadata: { type: 'json', required: false, fieldName: 'metadata' },
        expiresAt: { type: 'date', required: false, fieldName: 'expires_at' },
        revokedAt: { type: 'date', required: false, fieldName: 'revoked_at' },
        lastUsedAt: { type: 'date', required: false, fieldName: 'last_used_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_api_keys_secret_hash',
          fields: ['secretHash'],
          unique: true
        },
        {
          name: 'idx_authfn_api_keys_user_id_created_at',
          fields: ['userId', 'createdAt']
        }
      ]
    }
  ];
}

function createApiKeyRoutes(
  ctx: AuthFnPluginRuntimeContext,
  config: ApiKeyPluginConfig
): Route[] {
  return [
    {
      method: 'POST',
      path: '/api-keys',
      meta: createAuthFnRouteMeta('createApiKey', 'Create a new API key for the current user', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request) => {
        const state = await requireCookieSession(ctx.config, request);
        assertValidCsrf(request, state);
        const body = await request.json() as {
          name?: string;
          scopes?: string[];
          metadata?: Record<string, unknown>;
          expiresAt?: string;
        };
        const created = await createApiKey(ctx.config, {
          userId: state.user.id,
          name: body.name ?? 'api-key',
          scopes: body.scopes,
          metadata: body.metadata,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
        }, {
          now: config.now,
          secretPrefix: config.secretPrefix
        });

        await emitAuthEvent(ctx.config, {
          type: 'authfn.api_key.created',
          requestId: eventRequestId(request),
          actorId: state.user.id,
          userId: state.user.id,
          outcome: 'created',
          metadata: {
            keyId: created.keyId,
            scopes: body.scopes ?? []
          }
        });

        return jsonSuccess(request, {
          keyId: created.keyId,
          secret: created.secret,
          secretReturnedOnce: true
        }, {
          status: 201
        });
      }
    },
    {
      method: 'GET',
      path: '/api-keys',
      meta: createAuthFnRouteMeta('listApiKeys', 'List API keys for the current user', {
        mode: 'cookie-session'
      }),
      handler: async (request) => {
        const state = await requireCookieSession(ctx.config, request);
        const keys = await listApiKeysForUser(ctx.config, state.user.id);
        return jsonSuccess(request, {
          keys
        });
      }
    },
    {
      method: 'DELETE',
      path: '/api-keys/:keyId',
      meta: createAuthFnRouteMeta('revokeApiKey', 'Revoke an API key for the current user', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request, context) => {
        const state = await requireCookieSession(ctx.config, request);
        assertValidCsrf(request, state);
        await revokeApiKeyById(ctx.config, context.params.keyId, {
          userId: state.user.id,
          now: config.now
        });
        await emitAuthEvent(ctx.config, {
          type: 'authfn.api_key.revoked',
          requestId: eventRequestId(request),
          actorId: state.user.id,
          userId: state.user.id,
          outcome: 'revoked',
          metadata: {
            keyId: context.params.keyId
          }
        });
        return jsonSuccess(request, {
          revoked: true,
          keyId: context.params.keyId
        });
      }
    }
  ];
}
