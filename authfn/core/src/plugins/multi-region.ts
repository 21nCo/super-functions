import type { Route } from '@superfunctions/http';
import type { MultiRegionPluginConfig } from '../plugin-types.js';
import type {
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnRuntimeResolution,
  AuthFnSchemaDefinition
} from '../types.js';
import { resolveCookiePolicy } from '../core/cookies.js';
import {
  buildLookupResult,
  ensureRegionAlignmentForIdentifier,
  ensureRegionAlignmentForUser,
  getMultiRegionPluginConfig,
  rememberMultiRegionPluginConfig,
  registerUserRegion,
  unregisterRegionLookupForIdentifier
} from '../core/regions.js';
import { resolveRuntime } from '../core/runtime.js';
import { createAuthFnRouteMeta } from '../http/router.js';
import { jsonSuccess } from '../http/envelopes.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';

export function authFnMultiRegionPlugin(config: MultiRegionPluginConfig = {}): AuthFnPlugin {
  const plugin: AuthFnPlugin = {
    name: 'multiRegion',
    schema: () => config.schema ?? createMultiRegionSchema(),
    routes: (ctx) => createMultiRegionRoutes(ctx),
    hookFailurePolicy: {
      afterUserCreate: 'fail'
    },
    hooks: {
      beforeUserCreate: async (ctx, input) => {
        const authConfig = ctx.config;
        const runtime = ctx.runtime;
        const primaryEmail = readOptionalString(input.primaryEmail);
        if (!authConfig || !runtime || !primaryEmail) {
          return input;
        }

        await ensureRegionAlignmentForIdentifier(authConfig, config, {
          identifier: primaryEmail,
          runtime,
          request: ctx.request
        });
        return input;
      },
      afterUserCreate: async (ctx, payload) => {
        const authConfig = ctx.config;
        const userId = readRequiredString(payload.id);
        const runtime = ctx.runtime;
        if (!authConfig || !runtime) {
          return;
        }

        await registerUserRegion(authConfig, config, {
          user: {
            id: userId,
            primaryEmail: readOptionalString(payload.primaryEmail)
          },
          runtime,
          request: ctx.request
        });
      },
      beforeSessionIssue: async (ctx, input) => {
        const authConfig = ctx.config;
        if (!authConfig || !ctx.actorId || !ctx.runtime) {
          return input;
        }

        const alignment = await ensureRegionAlignmentForUser(authConfig, config, {
          userId: ctx.actorId,
          runtime: ctx.runtime,
          request: ctx.request
        });

        return {
          ...input,
          regionId: alignment.regionId ?? readOptionalString(input.regionId)
        };
      },
      afterAccountDelete: async (ctx, result) => {
        const authConfig = ctx.config;
        const primaryEmail = readOptionalString(result.primaryEmail);
        if (!authConfig || !primaryEmail) {
          return;
        }

        await unregisterRegionLookupForIdentifier(authConfig, config, primaryEmail);
      }
    }
  };

  rememberMultiRegionPluginConfig(plugin, config);
  return plugin;
}

function createMultiRegionSchema(): AuthFnSchemaDefinition['schemas'] {
  return [
    {
      modelName: 'region_profiles',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        regionId: { type: 'string', required: true, fieldName: 'region_id' },
        authority: { type: 'string', required: true, fieldName: 'authority' },
        domain: { type: 'string', required: false, fieldName: 'domain' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_region_profiles_region_id',
          fields: ['regionId']
        },
        {
          name: 'idx_authfn_region_profiles_user_id',
          fields: ['userId'],
          unique: true
        }
      ]
    }
  ];
}

function createMultiRegionRoutes(ctx: AuthFnPluginRuntimeContext): Route[] {
  return [
    {
      method: 'POST',
      path: '/regions/lookup',
      meta: createAuthFnRouteMeta('lookupRegion', 'Lookup region routing guidance for an identifier', {
        mode: 'none'
      }),
      handler: async (request) => {
        const runtime = await resolveRuntime(ctx.config, request);
        const body = await request.json() as {
          identifier?: string;
        };
        const pluginConfig = getMultiRegionPluginConfig(ctx.config) ?? {};
        const lookup = await buildLookupResult(ctx.config, pluginConfig, {
          identifier: body.identifier ?? '',
          request,
          runtime
        });

        await emitAuthEvent(ctx.config, {
          type: 'authfn.region.lookup',
          requestId: eventRequestId(request),
          userId: lookup.userId,
          regionId: lookup.regionId,
          outcome: lookup.continueLocally ? 'local' : 'redirect',
          metadata: {
            identifier: lookup.identifier,
            authority: lookup.authority,
            continueLocally: lookup.continueLocally
          }
        });

        return jsonSuccess(request, lookup);
      }
    },
    {
      method: 'GET',
      path: '/runtime',
      meta: createAuthFnRouteMeta('getRuntime', 'Get resolved runtime and cookie/provider overrides', {
        mode: 'none'
      }),
      handler: async (request) => {
        const runtime = await resolveRuntime(ctx.config, request);
        const cookiePolicy = resolveCookiePolicy(ctx.config, request, runtime);

        return jsonSuccess(request, {
          issuer: runtime.issuer,
          baseUrl: runtime.baseUrl,
          regionId: runtime.regionId ?? null,
          cookie: {
            prefix: cookiePolicy.prefix,
            domain: cookiePolicy.domain ?? null,
            secure: cookiePolicy.secure,
            sameSite: cookiePolicy.sameSite,
            path: cookiePolicy.path,
            sessionCookieName: cookiePolicy.sessionCookieName,
            csrfCookieName: cookiePolicy.csrfCookieName
          },
          oauth: sanitizeRuntimeOAuth(runtime)
        });
      }
    }
  ];
}

function sanitizeRuntimeOAuth(runtime: AuthFnRuntimeResolution): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(runtime.oauth ?? {}).map(([providerId, config]) => [
      providerId,
      {
        clientId: config?.clientId ?? null,
        hasClientSecret: Boolean(config?.clientSecret),
        hasClientSecretResolver: Boolean(config?.clientSecretResolver),
        allowlistedRedirectUris: config?.allowlistedRedirectUris ?? [],
        allowlistedReturnTo: config?.allowlistedReturnTo ?? [],
        scopes: config?.scopes ?? []
      }
    ])
  );
}

function readRequiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('multi-region hook requires a user id');
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
