import type { Route } from '@superfunctions/http';
import type { MultiRegionPluginConfig, MultiRegionPluginRuntimeConfig } from 'authfn/plugin-types';
import type {
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnEnvironment,
  AuthFnSchemaDefinition
} from 'authfn';
import { AuthFnConfigError, AuthFnValidationError } from 'authfn';
import { resolveCookiePolicy } from 'authfn/core/cookies';
import {
  buildLookupResult,
  ensureRegionAlignmentForIdentifier,
  ensureRegionAlignmentForUser,
  getMultiRegionPluginConfig,
  registerUserRegion,
  unregisterRegionLookupForIdentifier
} from 'authfn/core/regions';
import { resolveEnvironment } from 'authfn/core/environment';
import { createAuthFnRouteMeta } from 'authfn/http/router';
import { jsonSuccess } from 'authfn/http/envelopes';
import { emitAuthEvent, eventRequestId } from 'authfn/core/observability';
import { tombstoneAuthFnIdentityPlacement } from 'authfn/core/gateway-routing';

export type {
  AuthFnCanonicalRoutingConfig,
  AuthFnIdentityPlacement,
  AuthFnIdentityPlacementDirectoryAdapter,
  AuthFnIdentityPlacementState,
  AuthFnMultiRegionLookupInput,
  AuthFnMultiRegionLookupResult,
  AuthFnMultiRegionRegionConfig,
  AuthFnMultiRegionRegistrationInput,
  AuthFnRegionLookupRecord,
  MultiRegionPluginConfig,
  MultiRegionPluginRuntimeConfig
} from 'authfn/plugin-types';
export { authFnMultiRegionEnvironment } from 'authfn/core/regions';
export {
  classifyAuthFnRoute,
  createAuthFnCanonicalGateway,
  createAuthFnCellPlacementMiddleware,
  createInMemoryAuthFnPlacementDirectory,
  createInMemoryAuthFnRoutingReplayStore,
  createStoreBackedAuthFnPlacementDirectory,
  moveAuthFnIdentityPlacement,
  tombstoneAuthFnIdentityPlacement
} from 'authfn/core/gateway-routing';
export type {
  AuthFnCanonicalGateway,
  AuthFnCanonicalGatewayOptions,
  AuthFnGatewayCell,
  AuthFnGatewayIdentity,
  AuthFnIdentityMoveCallbacks,
  AuthFnRouteClassification,
  AuthFnRouteScope
} from 'authfn/core/gateway-routing';

export function authFnMultiRegionPlugin(
  config: MultiRegionPluginConfig = {}
): AuthFnPlugin<'multiRegion', MultiRegionPluginRuntimeConfig> {
  const plugin: AuthFnPlugin<'multiRegion', MultiRegionPluginRuntimeConfig> = {
    name: 'multiRegion',
    schema: () => config.schema ?? createMultiRegionSchema(),
    routes: (ctx) => createMultiRegionRoutes(ctx),
    hookFailurePolicy: {
      afterUserCreate: 'fail'
    },
    validateConfig: (runtimeConfig) => {
      const pluginConfig = getMultiRegionPluginConfig(runtimeConfig);
      if (pluginConfig?.routing?.mode !== 'gateway') return;
      if (!pluginConfig.routing.publicAuthority || !pluginConfig.routing.placementDirectory) {
        throw new AuthFnConfigError('Gateway-mode multi-region AuthFn requires publicAuthority and placementDirectory');
      }
      if (pluginConfig.routing.cell && !pluginConfig.routing.cell.replayStore) {
        throw new AuthFnConfigError('Gateway-mode AuthFn cells require a replayStore');
      }
    },
    hooks: {
      beforeUserCreate: async (ctx, input) => {
        const authConfig = ctx.config;
        const runtime = ctx.environment;
        const primaryEmail = readOptionalString(input.primaryEmail);
        if (!authConfig || !runtime || !primaryEmail) {
          return input;
        }
        const pluginConfig = getMultiRegionPluginConfig(authConfig) ?? {};

        if (pluginConfig.routing?.mode === 'gateway') {
          return input;
        }

        await ensureRegionAlignmentForIdentifier(authConfig, pluginConfig, {
          identifier: primaryEmail,
          environment: runtime,
          request: ctx.request
        });
        return input;
      },
      afterUserCreate: async (ctx, payload) => {
        const authConfig = ctx.config;
        const userId = readRequiredString(payload.id);
        const runtime = ctx.environment;
        if (!authConfig || !runtime) {
          return;
        }
        const pluginConfig = getMultiRegionPluginConfig(authConfig) ?? {};

        await registerUserRegion(authConfig, pluginConfig, {
          user: {
            id: userId,
            primaryEmail: readOptionalString(payload.primaryEmail)
          },
          environment: runtime,
          request: ctx.request
        });
      },
      beforeSessionIssue: async (ctx, input) => {
        const authConfig = ctx.config;
        if (!authConfig || !ctx.actorId || !ctx.environment) {
          return input;
        }
        const pluginConfig = getMultiRegionPluginConfig(authConfig) ?? {};

        if (pluginConfig.routing?.mode === 'gateway') {
          return {
            ...input,
            regionId: ctx.environment.regionId ?? readOptionalString(input.regionId)
          };
        }

        const alignment = await ensureRegionAlignmentForUser(authConfig, pluginConfig, {
          userId: ctx.actorId,
          environment: ctx.environment,
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
        const pluginConfig = getMultiRegionPluginConfig(authConfig) ?? {};

        const routing = pluginConfig.routing;
        if (
          routing?.mode === 'gateway'
          && routing.placementDirectory
          && routing.identityKeyForIdentifier
        ) {
          await tombstoneAuthFnIdentityPlacement(
            routing.placementDirectory,
            routing.identityKeyForIdentifier(primaryEmail.trim().toLowerCase())
          );
        }

        await unregisterRegionLookupForIdentifier(authConfig, pluginConfig, primaryEmail);
      }
    }
  };
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
        const runtime = await resolveEnvironment(ctx.config, request);
        const body = await request.json() as {
          identifier?: string;
        };
        const pluginConfig = getMultiRegionPluginConfig(ctx.config) ?? {};
        if (pluginConfig.routing?.mode === 'gateway') {
          const identifier = normalizeGatewayIdentifier(body.identifier ?? '');
          return jsonSuccess(request, {
            identifier,
            authority: new URL(pluginConfig.routing.publicAuthority!).origin,
            continueLocally: true
          });
        }
        const lookup = await buildLookupResult(ctx.config, pluginConfig, {
          identifier: body.identifier ?? '',
          request,
          environment: runtime
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
      path: '/environment',
      meta: createAuthFnRouteMeta('getEnvironment', 'Get resolved environment and cookie/provider overrides', {
        mode: 'none'
      }),
      handler: async (request) => {
        const runtime = await resolveEnvironment(ctx.config, request);
        const cookiePolicy = resolveCookiePolicy(ctx.config, request, runtime);

        return jsonSuccess(request, {
          issuer: runtime.issuer,
          baseUrl: runtime.baseUrl,
          regionId: pluginConfigForEnvironment(ctx)?.routing?.mode === 'gateway'
            ? null
            : runtime.regionId ?? null,
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

function pluginConfigForEnvironment(ctx: AuthFnPluginRuntimeContext): MultiRegionPluginRuntimeConfig | null {
  return getMultiRegionPluginConfig(ctx.config);
}

function normalizeGatewayIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new AuthFnValidationError('A valid identifier is required', { field: 'identifier' });
  }
  return normalized;
}

function sanitizeRuntimeOAuth(runtime: AuthFnEnvironment): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(runtime.oauth ?? {}).map(([providerId, config]) => {
      const record = isRecord(config) ? config : {};
      return [
        providerId,
        {
          clientId: typeof record.clientId === 'string' ? record.clientId : null,
          hasClientSecret: typeof record.clientSecret === 'string',
          hasClientSecretResolver: typeof record.clientSecretResolver === 'function',
          allowlistedRedirectUris: readStringArray(record.allowlistedRedirectUris),
          allowlistedReturnTo: readStringArray(record.allowlistedReturnTo),
          scopes: readStringArray(record.scopes)
        }
      ];
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
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
