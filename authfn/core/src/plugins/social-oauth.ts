import { randomBytes } from 'node:crypto';
import type { Adapter, TableSchema } from '@superfunctions/db';
import type { Route } from '@superfunctions/http';
import {
  createOAuthFlowService,
  type OAuthFlowCallbackResult,
  type OAuthFlowResolvedIdentity,
  type OAuthFlowService,
  type OAuthProviderRuntimeConfig
} from '@superfunctions/oauth-flow';
import { DefaultOAuthTokenHttpClient, type OAuthFetchLike } from '@superfunctions/oauth-http';
import {
  DbAdapterOAuthStateStore,
  DbAdapterTokenVault,
  getOAuthStorageTableDefinitions
} from '@superfunctions/oauth-storage';
import {
  createDefaultProviderPolicyRegistry,
  getOAuthProviderDescriptor
} from '@superfunctions/oauth-providers';
import type { SocialOAuthPluginConfig } from '../plugin-types.js';
import type {
  AuthFnConfig,
  AuthFnHookContext,
  AuthFnHooks,
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnRuntimeResolution,
  AuthFnSchemaDefinition,
  AuthFnSocialHandoffMode,
  AuthFnSocialProfile,
  AuthFnSocialProfileResolver,
  AuthFnSocialProviderConfig,
  AuthFnSocialProviderId,
  AuthFnUserRecord
} from '../types.js';
import { assertValidCsrf, issueSession, requireCookieSession } from '../core/sessions.js';
import { issueSessionCookies, resolveRuntime } from '../core/cookies.js';
import {
  beginTwoFactorChallenge,
  createPendingTwoFactorResponse,
  getTwoFactorPluginConfig
} from '../core/two-factor.js';
import {
  buildOAuthAccountProfile,
  deleteOAuthAccountByConnectionId,
  findOAuthAccountByProviderAccountId,
  requireOAuthAccountForUser,
  upsertOAuthAccount
} from '../core/oauth-accounts.js';
import {
  AuthFnConflictError,
  AuthFnError,
  AuthFnOAuthCallbackInvalidError,
  AuthFnOAuthProviderUnsupportedError,
  AuthFnPluginAbortedError,
  AuthFnRedirectUriDisallowedError,
  AuthFnValidationError
} from '../core/errors.js';
import { createUser, findUserById, findUserByPrimaryEmail } from '../core/users.js';
import { createAuthFnRouteMeta } from '../http/router.js';
import { jsonSuccess, resolveRequestId } from '../http/envelopes.js';
import { emitAuthEvent } from '../core/observability.js';

const SOCIAL_PROVIDER_METHODS = {
  google: 'oauth-google',
  apple: 'oauth-apple',
  github: 'oauth-github'
} as const;

const CALLBACK_METADATA_MODE = 'callbackMode';
const CALLBACK_METADATA_HANDOFF = 'handoffMode';

interface SocialStartBody {
  provider?: AuthFnSocialProviderId;
  returnTo?: string;
  callbackMode?: 'redirect' | 'json';
  handoffMode?: AuthFnSocialHandoffMode;
}

interface SocialCallbackCompletion {
  provider: AuthFnSocialProviderId;
  linked: boolean;
  callbackMode: 'redirect' | 'json';
  handoffMode: AuthFnSocialHandoffMode;
  redirectTo?: string;
  session: Awaited<ReturnType<typeof issueSession>>['session'];
  userId: string;
  oauthAccountId?: string;
  connectionId?: string;
}

interface ResolvedSocialIdentity {
  user: AuthFnUserRecord;
  profile: AuthFnSocialProfile;
  connectionId: string;
  existingAccountId?: string;
}

interface ResolvedProviderSettings {
  providerId: AuthFnSocialProviderId;
  clientId: string;
  clientSecret?: string;
  clientSecretResolver?: AuthFnSocialProviderConfig['clientSecretResolver'];
  allowlistedRedirectUris: string[];
  allowlistedReturnTo: string[];
  scopes: string[];
  linkByVerifiedEmail: boolean;
  profileResolver?: AuthFnSocialProfileResolver;
}

export function authFnSocialOAuthPlugin(config: SocialOAuthPluginConfig = {}): AuthFnPlugin {
  return {
    name: 'socialOAuth',
    schema: () => createSocialSchema(config),
    routes: (ctx) => createSocialRoutes(ctx, config)
  };
}

function createSocialSchema(config: SocialOAuthPluginConfig): AuthFnSchemaDefinition['schemas'] {
  return [
    ...createOAuthSharedSchemas(),
    ...(config.schema ?? [createOAuthAccountsSchema()])
  ];
}

function createSocialRoutes(
  ctx: AuthFnPluginRuntimeContext,
  config: SocialOAuthPluginConfig
): Route[] {
  return [
    {
      method: 'POST',
      path: '/social/start',
      meta: createAuthFnRouteMeta('startSocialSignIn', 'Start social OAuth sign-in', {
        mode: 'none'
      }),
      handler: async (request) => {
        const runtime = await resolveRuntime(ctx.config, request);
        const body = await request.json() as SocialStartBody;
        const providerId = normalizeProviderId(body.provider);
        const callbackUri = buildCallbackUri(runtime.baseUrl, ctx.basePath, providerId);
        const providerSettings = resolveProviderSettings(config, runtime, providerId, callbackUri);
        const hookInput = await runBeforeOAuthStart(ctx, request, runtime, {
          provider: providerId,
          returnTo: body.returnTo,
          callbackMode: body.callbackMode ?? inferCallbackMode(body.returnTo),
          handoffMode: body.handoffMode
            ?? inferHandoffMode(
              body.returnTo,
              body.callbackMode ?? inferCallbackMode(body.returnTo),
              config.defaultHandoffMode
            )
        });
        const callbackMode = normalizeCallbackMode(
          readOptionalString(hookInput.callbackMode) ?? body.callbackMode ?? inferCallbackMode(body.returnTo)
        );
        const returnTo = readOptionalString(hookInput.returnTo) ?? body.returnTo;
        const handoffMode = normalizeHandoffMode(
          readOptionalString(hookInput.handoffMode)
            ?? body.handoffMode
            ?? inferHandoffMode(returnTo, callbackMode, config.defaultHandoffMode)
        );

        assertAllowedReturnTarget(providerSettings, returnTo, callbackMode);

        const requestId = resolveRequestId(request);
        const flowService = createSocialFlowService(ctx.config, ctx.hooks, config, request, runtime, providerId);
        const result = await flowService.start({
          providerId,
          redirectUri: callbackUri,
          scopes: await authorizeScopes(providerSettings, requestId),
          subject: {
            kind: 'browser-auth',
            intentId: createIdentifier('intent'),
            regionId: runtime.regionId,
            returnTo,
            metadata: {
              [CALLBACK_METADATA_MODE]: callbackMode,
              [CALLBACK_METADATA_HANDOFF]: handoffMode
            }
          },
          requestId
        });

        await emitAuthEvent(ctx.config, {
          type: 'authfn.oauth.started',
          requestId,
          provider: providerId,
          regionId: runtime.regionId,
          outcome: 'started',
          metadata: {
            stateId: result.stateId,
            callbackMode,
            handoffMode,
            returnTo
          }
        });

        return jsonSuccess(request, {
          provider: providerId,
          redirectTo: result.authorizationUrl,
          stateId: result.stateId,
          expiresAt: result.expiresAt
        });
      }
    },
    {
      method: 'GET',
      path: '/social/callback/:provider',
      meta: createAuthFnRouteMeta('completeSocialSignIn', 'Complete social OAuth sign-in', {
        mode: 'none'
      }),
      handler: async (request, context) => {
        const providerId = normalizeProviderId(context.params.provider);
        const runtime = await resolveRuntime(ctx.config, request);
        const callbackUri = buildCallbackUri(runtime.baseUrl, ctx.basePath, providerId);
        const providerSettings = resolveProviderSettings(config, runtime, providerId, callbackUri);
        const url = new URL(request.url);
        const requestId = resolveRequestId(request);
        const flowService = createSocialFlowService(ctx.config, ctx.hooks, config, request, runtime, providerId);
        const callbackResult = await flowService.handleCallback({
          providerId,
          code: readRequiredString(url.searchParams.get('code'), 'code'),
          state: readRequiredString(url.searchParams.get('state'), 'state'),
          redirectUri: callbackUri,
          requestId
        });

        const resolvedIdentity = requireResolvedIdentity(callbackResult);
        const user = await findUserById(ctx.config, resolvedIdentity.userId);
        if (!user) {
          throw new AuthFnOAuthCallbackInvalidError('Linked authfn user not found after OAuth callback', {
            provider: providerId,
            userId: resolvedIdentity.userId
          });
        }

        const twoFactorConfig = getTwoFactorPluginConfig(ctx.config);
        if (twoFactorConfig) {
          const pendingChallenge = await beginTwoFactorChallenge(
            ctx.config,
            user,
            SOCIAL_PROVIDER_METHODS[providerId],
            twoFactorConfig
          );
          if (pendingChallenge) {
            const challengeError = createPendingTwoFactorResponse(pendingChallenge.challenge);
            const completion = {
              provider: providerId,
              linked: true,
              callbackMode: readStoredCallbackMode(callbackResult),
              handoffMode: readStoredHandoffMode(callbackResult, config.defaultHandoffMode),
              redirectTo: callbackResult.subject.returnTo,
              challengeId: pendingChallenge.challenge.id,
              primaryMethod: SOCIAL_PROVIDER_METHODS[providerId]
            } as Record<string, unknown>;

            await ctx.hooks.afterOAuthCallback?.(
              buildHookContext(ctx.config, request, runtime, user.id),
              completion
            );

            await emitAuthEvent(ctx.config, {
              type: 'authfn.2fa.challenged',
              requestId,
              actorId: user.id,
              userId: user.id,
              regionId: runtime.regionId,
              provider: providerId,
              outcome: 'required',
              metadata: {
                challengeId: pendingChallenge.challenge.id,
                primaryMethod: SOCIAL_PROVIDER_METHODS[providerId]
              }
            });

            await emitAuthEvent(ctx.config, {
              type: 'authfn.oauth.completed',
              requestId,
              actorId: user.id,
              userId: user.id,
              regionId: runtime.regionId,
              provider: providerId,
              outcome: 'two-factor-required',
              metadata: {
                callbackMode: completion.callbackMode,
                handoffMode: completion.handoffMode,
                challengeId: pendingChallenge.challenge.id
              }
            });

            if (completion.callbackMode === 'redirect') {
              assertAllowedReturnTarget(providerSettings, completion.redirectTo as string | undefined, 'redirect');
              return redirectWithCookies(
                request,
                appendTwoFactorChallengeToReturnTarget(
                  completion.redirectTo as string,
                  pendingChallenge.challenge.id,
                  SOCIAL_PROVIDER_METHODS[providerId]
                ),
                [],
                303
              );
            }

            throw challengeError;
          }
        }

        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: user.id,
          primaryEmail: user.primaryEmail,
          regionId: runtime.regionId,
          methods: [SOCIAL_PROVIDER_METHODS[providerId]]
        });
        const cookies = Object.values(
          issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken)
        );
        const oauthAccountId = readOptionalString(resolvedIdentity.metadata?.oauthAccountId);
        const completion: SocialCallbackCompletion = {
          provider: providerId,
          linked: true,
          callbackMode: readStoredCallbackMode(callbackResult),
          handoffMode: readStoredHandoffMode(callbackResult, config.defaultHandoffMode),
          redirectTo: callbackResult.subject.returnTo,
          session: issued.session,
          userId: user.id,
          oauthAccountId,
          connectionId: callbackResult.connectionId
        };

        await ctx.hooks.afterOAuthCallback?.(
          buildHookContext(ctx.config, request, runtime, user.id, issued.session),
          completion as unknown as Record<string, unknown>
        );

        await emitAuthEvent(ctx.config, {
          type: 'authfn.oauth.completed',
          requestId,
          actorId: user.id,
          sessionId: issued.session.id,
          userId: user.id,
          regionId: runtime.regionId,
          provider: providerId,
          outcome: 'linked',
          metadata: {
            callbackMode: completion.callbackMode,
            handoffMode: completion.handoffMode,
            oauthAccountId,
            connectionId: callbackResult.connectionId
          }
        });

        if (completion.callbackMode === 'redirect') {
          assertAllowedReturnTarget(providerSettings, completion.redirectTo, 'redirect');
          return redirectWithCookies(
            request,
            completion.handoffMode === 'session-token'
              ? appendSessionHandoffToReturnTarget(completion.redirectTo!, issued)
              : completion.redirectTo!,
            cookies,
            303
          );
        }

        return jsonSuccess(request, {
          linked: completion.linked,
          provider: completion.provider,
          session: completion.session,
          ...(completion.handoffMode === 'session-token'
            ? {
                handoff: buildSessionHandoffPayload(issued)
              }
            : {})
        }, {
          setCookies: cookies
        });
      }
    },
    {
      method: 'POST',
      path: '/social/disconnect/:provider',
      meta: createAuthFnRouteMeta('disconnectSocialAccount', 'Disconnect a linked social OAuth account', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request, context) => {
        const providerId = normalizeProviderId(context.params.provider);
        const runtime = await resolveRuntime(ctx.config, request);
        const state = await requireCookieSession(ctx.config, request);
        assertValidCsrf(request, state);
        const callbackUri = buildCallbackUri(runtime.baseUrl, ctx.basePath, providerId);
        resolveProviderSettings(config, runtime, providerId, callbackUri);
        const account = await requireOAuthAccountForUser(ctx.config, state.user.id, providerId);
        const flowService = createSocialFlowService(ctx.config, ctx.hooks, config, request, runtime, providerId);

        await flowService.disconnect({
          connectionId: account.connectionId,
          providerId,
          revokeRemote: true,
          requestId: resolveRequestId(request)
        });

        return jsonSuccess(request, {
          disconnected: true,
          provider: providerId
        });
      }
    }
  ];
}

function createSocialFlowService(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  pluginConfig: SocialOAuthPluginConfig,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  activeProviderId: AuthFnSocialProviderId
): OAuthFlowService {
  const providers = {
    [activeProviderId]: getOAuthProviderDescriptor(activeProviderId)
  };
  const callbackUri = buildCallbackUri(runtime.baseUrl, config.basePath ?? '/auth', activeProviderId);
  const settings = resolveProviderSettings(pluginConfig, runtime, activeProviderId, callbackUri);
  const providerRuntimeConfig = {
    [activeProviderId]: {
      clientId: settings.clientId,
      clientSecret: settings.clientSecret,
      clientSecretResolver: settings.clientSecretResolver,
      allowlistedRedirectUris: settings.allowlistedRedirectUris
    } satisfies OAuthProviderRuntimeConfig
  };
  const namespacedAdapter = withNamespace(config.database, config.namespace ?? 'authfn');
  const tokenHttpClient = pluginConfig.tokenHttpClient ?? new DefaultOAuthTokenHttpClient({
    fetcher: pluginConfig.fetcher
  });

  return createOAuthFlowService({
    providers,
    providerRuntimeConfig,
    stateStore: new DbAdapterOAuthStateStore(namespacedAdapter),
    tokenVault: new DbAdapterTokenVault(namespacedAdapter),
    tokenHttpClient,
    now: pluginConfig.now,
    identityHooks: {
      resolveBrowserAuthIdentity: async ({ providerId, tokenSet }) => {
        const resolved = await resolveLocalIdentity(
          config,
          hooks,
          pluginConfig,
          request,
          runtime,
          normalizeProviderId(providerId),
          tokenSet
        );

        const identity: OAuthFlowResolvedIdentity = {
          tenantId: config.namespace ?? 'authfn',
          userId: resolved.user.id,
          connectionId: resolved.connectionId,
          metadata: {
            oauthAccountId: resolved.existingAccountId,
            profile: buildOAuthAccountProfile(normalizeProviderId(providerId), resolved.profile)
          }
        };

        return identity;
      },
      onConnected: async (result) => {
        const resolvedIdentity = requireResolvedIdentity(result);
        const userId = resolvedIdentity.userId;
        const profile = readProfileMetadata(resolvedIdentity.metadata);
        const account = await upsertOAuthAccount(config, {
          userId,
          provider: normalizeProviderId(result.providerId),
          providerAccountId: profile.providerAccountId,
          connectionId: result.connectionId ?? readRequiredString(resolvedIdentity.connectionId, 'connectionId'),
          email: profile.email,
          profile: profile.profile
        });

        if (resolvedIdentity.metadata) {
          resolvedIdentity.metadata.oauthAccountId = account.id;
        }
      },
      onDisconnected: async (input) => {
        await deleteOAuthAccountByConnectionId(config, input.connectionId);
      }
    }
  });
}

async function resolveLocalIdentity(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  pluginConfig: SocialOAuthPluginConfig,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  providerId: AuthFnSocialProviderId,
  tokenSet: SocialTokenSet
): Promise<ResolvedSocialIdentity> {
  const providerSettings = resolveProviderSettings(
    pluginConfig,
    runtime,
    providerId,
    buildCallbackUri(runtime.baseUrl, config.basePath ?? '/auth', providerId)
  );
  const profile = await resolveProviderProfile(providerId, tokenSet, request, runtime, providerSettings, pluginConfig.fetcher);
  const existingAccount = await findOAuthAccountByProviderAccountId(config, providerId, profile.providerAccountId);
  if (existingAccount) {
    const linkedUser = await findUserById(config, existingAccount.userId);
    if (!linkedUser) {
      throw new AuthFnOAuthCallbackInvalidError('OAuth account links to a missing authfn user', {
        provider: providerId,
        providerAccountId: profile.providerAccountId
      });
    }

    return {
      user: linkedUser,
      profile,
      connectionId: existingAccount.connectionId,
      existingAccountId: existingAccount.id
    };
  }

  const normalizedEmail = normalizeEmail(profile.email);
  if (normalizedEmail) {
    const existingUser = await findUserByPrimaryEmail(config, normalizedEmail);
    if (existingUser) {
      if (providerSettings.linkByVerifiedEmail && profile.emailVerified && existingUser.emailVerifiedAt) {
        return {
          user: existingUser,
          profile: {
            ...profile,
            email: normalizedEmail
          },
          connectionId: createConnectionId(providerId, existingUser.id)
        };
      }

      throw new AuthFnConflictError('A user with this email already exists', {
        provider: providerId,
        primaryEmail: normalizedEmail
      });
    }
  }

  const user = await createSocialUser(config, request, runtime, providerId, {
    ...profile,
    email: normalizedEmail
  }, hooks);
  return {
    user,
    profile: {
      ...profile,
      email: normalizedEmail
    },
    connectionId: createConnectionId(providerId, user.id)
  };
}

async function createSocialUser(
  config: AuthFnConfig,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  providerId: AuthFnSocialProviderId,
  profile: AuthFnSocialProfile,
  hooks: Partial<AuthFnHooks>
): Promise<AuthFnUserRecord> {
  const now = new Date();
  const input = {
    primaryEmail: profile.email,
    emailVerifiedAt: profile.emailVerified ? now : null,
    metadata: profile.name
      ? {
          displayName: profile.name,
          socialProvider: providerId
        }
      : {
          socialProvider: providerId
        }
  };
  const transformed = await hooks.beforeUserCreate?.(
    buildHookContext(config, request, runtime),
    input
  ) as typeof input | void;
  const resolved = transformed ?? input;
  const user = await createUser(config, {
    primaryEmail: normalizeEmail(readOptionalString(resolved.primaryEmail)),
    emailVerifiedAt: resolved.emailVerifiedAt instanceof Date ? resolved.emailVerifiedAt : input.emailVerifiedAt,
    metadata: readRecord(resolved.metadata) ?? input.metadata
  });

  try {
    await hooks.afterUserCreate?.(
      buildHookContext(config, request, runtime, user.id),
      {
        id: user.id,
        primaryEmail: user.primaryEmail,
        metadata: user.metadata ?? {}
      }
    );
  } catch {
    // Fail-open by hook contract.
  }

  return user;
}

function resolveProviderSettings(
  pluginConfig: SocialOAuthPluginConfig,
  runtime: AuthFnRuntimeResolution,
  providerId: AuthFnSocialProviderId,
  callbackUri: string
): ResolvedProviderSettings {
  const staticConfig = pluginConfig.providers?.[providerId] ?? {};
  const runtimeConfig = (
    (runtime.oauth ?? {}) as Partial<Record<AuthFnSocialProviderId, AuthFnSocialProviderConfig>>
  )[providerId] ?? {};
  const clientId = readOptionalString(runtimeConfig.clientId) ?? staticConfig.clientId;
  if (!clientId) {
    throw new AuthFnValidationError('Social OAuth runtime config missing clientId', {
      provider: providerId
    });
  }

  return {
    providerId,
    clientId,
    clientSecret: readOptionalString(runtimeConfig.clientSecret) ?? staticConfig.clientSecret,
    clientSecretResolver: readResolver(runtimeConfig.clientSecretResolver) ?? staticConfig.clientSecretResolver,
    allowlistedRedirectUris: readStringArray(runtimeConfig.allowlistedRedirectUris)
      ?? staticConfig.allowlistedRedirectUris
      ?? [callbackUri],
    allowlistedReturnTo: readStringArray(runtimeConfig.allowlistedReturnTo)
      ?? staticConfig.allowlistedReturnTo
      ?? [],
    scopes: readStringArray(runtimeConfig.scopes)
      ?? staticConfig.scopes
      ?? getOAuthProviderDescriptor(providerId).defaultScopes,
    linkByVerifiedEmail: staticConfig.linkByVerifiedEmail ?? false,
    profileResolver: staticConfig.profileResolver
  };
}

async function authorizeScopes(
  settings: ResolvedProviderSettings,
  requestId: string
): Promise<string[]> {
  const registry = createDefaultProviderPolicyRegistry(() => new Date().toISOString());
  registry.assertOperationAllowed({
    providerId: settings.providerId,
    operation: 'auth.signin',
    featureMode: 'metadata-only'
  });
  await registry.validateScopes({
    providerId: settings.providerId,
    feature: 'auth.social.profile',
    requestedScopes: settings.scopes,
    tenantId: 'authfn',
    userId: requestId,
    purpose: 'auth.signin'
  });

  return [...settings.scopes];
}

async function resolveProviderProfile(
  providerId: AuthFnSocialProviderId,
  tokenSet: SocialTokenSet,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  settings: ResolvedProviderSettings,
  fetcher: OAuthFetchLike | undefined
): Promise<AuthFnSocialProfile> {
  if (settings.profileResolver) {
    return settings.profileResolver({
      providerId,
      tokenSet,
      request,
      runtime,
      fetcher
    });
  }

  switch (providerId) {
    case 'google':
      return resolveGoogleProfile(tokenSet);
    case 'apple':
      return resolveAppleProfile(tokenSet);
    case 'github':
      return resolveGitHubProfile(tokenSet, fetcher);
    default:
      throw new AuthFnOAuthProviderUnsupportedError('Unsupported social OAuth provider', {
        provider: providerId
      });
  }
}

function resolveGoogleProfile(tokenSet: SocialTokenSet): AuthFnSocialProfile {
  const claims = parseIdTokenClaims(tokenSet.idToken);
  if (!claims.sub) {
    throw new AuthFnOAuthCallbackInvalidError('Google OAuth callback missing required subject claim', {
      provider: 'google'
    });
  }

  return {
    providerAccountId: claims.sub,
    email: normalizeEmail(claims.email),
    emailVerified: claims.emailVerified,
    name: claims.name,
    profile: cleanObject({
      sub: claims.sub,
      email: normalizeEmail(claims.email),
      emailVerified: claims.emailVerified,
      name: claims.name
    })
  };
}

function resolveAppleProfile(tokenSet: SocialTokenSet): AuthFnSocialProfile {
  const claims = parseIdTokenClaims(tokenSet.idToken);
  if (!claims.sub || !claims.email) {
    throw new AuthFnOAuthCallbackInvalidError('Apple OAuth callback missing required claims', {
      provider: 'apple'
    });
  }

  return {
    providerAccountId: claims.sub,
    email: normalizeEmail(claims.email),
    emailVerified: claims.emailVerified ?? true,
    name: claims.name,
    profile: cleanObject({
      sub: claims.sub,
      email: normalizeEmail(claims.email),
      emailVerified: claims.emailVerified ?? true,
      name: claims.name
    })
  };
}

async function resolveGitHubProfile(
  tokenSet: SocialTokenSet,
  fetcher: OAuthFetchLike | undefined
): Promise<AuthFnSocialProfile> {
  const http = fetcher ?? createGlobalFetchLike();
  const userResponse = await http('https://api.github.com/user', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${tokenSet.accessToken}`,
      accept: 'application/json'
    }
  });
  if (!userResponse.ok) {
    throw new AuthFnOAuthCallbackInvalidError('GitHub profile request failed', {
      provider: 'github',
      status: userResponse.status
    });
  }

  const userPayload = await readJsonRecord(userResponse);
  const emailResponse = await http('https://api.github.com/user/emails', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${tokenSet.accessToken}`,
      accept: 'application/json'
    }
  });
  if (!emailResponse.ok) {
    throw new AuthFnOAuthCallbackInvalidError('GitHub email request failed', {
      provider: 'github',
      status: emailResponse.status
    });
  }

  const emails = await readJsonArray(emailResponse);
  const primaryEmail = emails.find((entry) => entry.primary === true)
    ?? emails.find((entry) => entry.verified === true)
    ?? emails[0];
  const providerAccountId = readIdentifierString(userPayload.id, 'providerAccountId');
  const email = normalizeEmail(readOptionalString(primaryEmail?.email) ?? readOptionalString(userPayload.email));
  const emailVerified = primaryEmail?.verified === true;

  return {
    providerAccountId,
    email,
    emailVerified,
    name: readOptionalString(userPayload.name) ?? readOptionalString(userPayload.login),
    profile: cleanObject({
      id: providerAccountId,
      login: readOptionalString(userPayload.login),
      email,
      emailVerified,
      name: readOptionalString(userPayload.name) ?? readOptionalString(userPayload.login)
    })
  };
}

function createOAuthSharedSchemas(): TableSchema[] {
  return getOAuthStorageTableDefinitions().map((table) => ({
    modelName: table.name,
    fields: Object.fromEntries(
      table.fields.map((field) => [
        field.name,
        {
          type: mapOAuthFieldType(field.type),
          required: !field.nullable,
          unique: field.primaryKey || field.unique,
          fieldName: field.name
        }
      ])
    ),
    indexes: table.indexes?.map((index) => ({
      name: index.name,
      fields: [...index.fields],
      unique: index.unique
    }))
  }));
}

function createOAuthAccountsSchema(): TableSchema {
  return {
    modelName: 'oauth_accounts',
    fields: {
      id: { type: 'string', required: true, fieldName: 'id' },
      userId: {
        type: 'string',
        required: true,
        fieldName: 'user_id',
        references: { model: 'users', field: 'id', onDelete: 'cascade' }
      },
      provider: { type: 'string', required: true, fieldName: 'provider' },
      providerAccountId: { type: 'string', required: true, fieldName: 'provider_account_id' },
      connectionId: { type: 'string', required: true, fieldName: 'connection_id' },
      email: { type: 'string', required: false, fieldName: 'email' },
      profile: { type: 'json', required: false, fieldName: 'profile' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
      updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
    },
    indexes: [
      {
        name: 'idx_authfn_oauth_accounts_connection_id',
        fields: ['connectionId'],
        unique: true
      },
      {
        name: 'idx_authfn_oauth_accounts_provider_account',
        fields: ['provider', 'providerAccountId'],
        unique: true
      },
      {
        name: 'idx_authfn_oauth_accounts_user_id',
        fields: ['userId']
      }
    ]
  };
}

function mapOAuthFieldType(type: 'text' | 'json' | 'boolean'): 'string' | 'json' | 'boolean' {
  switch (type) {
    case 'json':
      return 'json';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function redirectWithCookies(
  request: Request,
  location: string,
  cookies: string[],
  status: 302 | 303
): Response {
  const headers = new Headers();
  headers.set('location', location);
  headers.set('x-request-id', resolveRequestId(request));
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }

  return new Response(null, {
    status,
    headers
  });
}

function buildSessionHandoffPayload(
  issued: Awaited<ReturnType<typeof issueSession>>
): Record<string, unknown> {
  return {
    type: 'session-token',
    token: issued.sessionToken,
    sessionId: issued.session.id,
    expiresAt: issued.session.expiresAt?.toISOString() ?? null
  };
}

function appendSessionHandoffToReturnTarget(
  returnTo: string,
  issued: Awaited<ReturnType<typeof issueSession>>
): string {
  const url = new URL(returnTo);
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  fragment.set('token', issued.sessionToken);
  fragment.set('sessionId', issued.session.id);
  if (issued.session.expiresAt) {
    fragment.set('expiresAt', issued.session.expiresAt.toISOString());
  }
  url.hash = fragment.toString();
  return url.toString();
}

function appendTwoFactorChallengeToReturnTarget(
  returnTo: string,
  challengeId: string,
  primaryMethod: string
): string {
  const url = new URL(returnTo);
  url.searchParams.set('authfnCode', 'AUTHFN_2FA_REQUIRED');
  url.searchParams.set('challengeId', challengeId);
  url.searchParams.set('primaryMethod', primaryMethod);
  return url.toString();
}

function assertAllowedReturnTarget(
  settings: ResolvedProviderSettings,
  returnTo: string | undefined,
  callbackMode: 'redirect' | 'json'
): void {
  if (callbackMode !== 'redirect') {
    return;
  }

  if (!returnTo) {
    throw new AuthFnRedirectUriDisallowedError('Redirect mode requires an allowlisted returnTo target', {
      provider: settings.providerId
    });
  }

  if (!settings.allowlistedReturnTo.includes(returnTo)) {
    throw new AuthFnRedirectUriDisallowedError('Redirect target is not allowlisted', {
      provider: settings.providerId,
      returnTo
    });
  }
}

function buildCallbackUri(baseUrl: string, basePath: string, providerId: AuthFnSocialProviderId): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return `${normalizedBase}${normalizedPath}/social/callback/${providerId}`;
}

function parseIdTokenClaims(idToken: string | undefined): {
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
} {
  if (!idToken) {
    return {};
  }

  const parts = idToken.split('.');
  if (parts.length < 2) {
    return {};
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    const fallbackName = [
      readOptionalString(payload.given_name),
      readOptionalString(payload.family_name)
    ].filter(Boolean).join(' ').trim();
    return {
      sub: readOptionalString(payload.sub),
      email: readOptionalString(payload.email),
      emailVerified: readOptionalBoolean(payload.email_verified),
      name: readOptionalString(payload.name) ?? (fallbackName || undefined)
    };
  } catch {
    return {};
  }
}

function createConnectionId(providerId: AuthFnSocialProviderId, userId: string): string {
  return `soc_${providerId}_${userId}_${createIdentifier('c').slice(2)}`;
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function buildHookContext(
  config: AuthFnConfig,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  actorId?: string,
  session?: SocialCallbackCompletion['session']
): AuthFnHookContext {
  return {
    config,
    request,
    runtime,
    actorId,
    session
  };
}

async function runBeforeOAuthStart(
  ctx: AuthFnPluginRuntimeContext,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const transformed = await ctx.hooks.beforeOAuthStart?.(
      buildHookContext(ctx.config, request, runtime),
      input
    );
    return (transformed ?? input) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AuthFnError) {
      throw error;
    }
    throw new AuthFnPluginAbortedError('beforeOAuthStart hook aborted social OAuth start', {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function requireResolvedIdentity(result: OAuthFlowCallbackResult): OAuthFlowResolvedIdentity {
  if (!result.resolvedIdentity) {
    throw new AuthFnOAuthCallbackInvalidError('OAuth callback did not resolve a local authfn identity', {
      provider: result.providerId
    });
  }

  return result.resolvedIdentity;
}

function readStoredCallbackMode(result: OAuthFlowCallbackResult): 'redirect' | 'json' {
  const raw = result.subject.metadata?.[CALLBACK_METADATA_MODE];
  return normalizeCallbackMode(readOptionalString(raw) ?? inferCallbackMode(result.subject.returnTo));
}

function readStoredHandoffMode(
  result: OAuthFlowCallbackResult,
  defaultHandoffMode: AuthFnSocialHandoffMode = 'none'
): AuthFnSocialHandoffMode {
  const raw = result.subject.metadata?.[CALLBACK_METADATA_HANDOFF];
  return normalizeHandoffMode(
    readOptionalString(raw) ?? inferHandoffMode(result.subject.returnTo, readStoredCallbackMode(result), defaultHandoffMode)
  );
}

function normalizeProviderId(value: unknown): AuthFnSocialProviderId {
  if (value === 'google' || value === 'apple' || value === 'github') {
    return value;
  }

  throw new AuthFnOAuthProviderUnsupportedError('Unsupported social OAuth provider', {
    provider: value
  });
}

function normalizeCallbackMode(value: string): 'redirect' | 'json' {
  if (value === 'redirect' || value === 'json') {
    return value;
  }

  throw new AuthFnValidationError('callbackMode must be "redirect" or "json"', {
    callbackMode: value
  });
}

function normalizeHandoffMode(value: string): AuthFnSocialHandoffMode {
  if (value === 'none' || value === 'session-token') {
    return value;
  }

  throw new AuthFnValidationError('handoffMode must be "none" or "session-token"', {
    handoffMode: value
  });
}

function inferCallbackMode(returnTo: string | undefined): 'redirect' | 'json' {
  return returnTo ? 'redirect' : 'json';
}

function inferHandoffMode(
  returnTo: string | undefined,
  callbackMode: 'redirect' | 'json',
  defaultHandoffMode: AuthFnSocialHandoffMode = 'none'
): AuthFnSocialHandoffMode {
  if (callbackMode !== 'redirect' || !returnTo) {
    return 'none';
  }

  try {
    const protocol = new URL(returnTo).protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return 'session-token';
    }
  } catch {
    return defaultHandoffMode;
  }

  return defaultHandoffMode;
}

function readRequiredString(value: unknown, field: string): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new AuthFnValidationError(`${field} is required`, { field });
  }
  return normalized;
}

function readIdentifierString(value: unknown, field: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return readRequiredString(value, field);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeEmail(value: string | undefined): string | undefined {
  const normalized = readOptionalString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (!normalized.includes('@')) {
    throw new AuthFnValidationError('A valid email is required', {
      email: value
    });
  }

  return normalized;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cleanObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)
  );
}

function readResolver(value: unknown): AuthFnSocialProviderConfig['clientSecretResolver'] | undefined {
  return typeof value === 'function'
    ? value as AuthFnSocialProviderConfig['clientSecretResolver']
    : undefined;
}

function readProfileMetadata(metadata: Record<string, unknown> | undefined): AuthFnSocialProfile {
  const profile = metadata?.profile;
  const record = readRecord(profile);
  if (!record) {
    throw new AuthFnOAuthCallbackInvalidError('OAuth callback is missing resolved profile metadata');
  }

  const providerAccountId = readRequiredString(record.providerAccountId, 'providerAccountId');
  return {
    providerAccountId,
    email: normalizeEmail(readOptionalString(record.email)),
    emailVerified: readOptionalBoolean(record.emailVerified),
    name: readOptionalString(record.name),
    profile: record
  };
}

async function readJsonRecord(response: Awaited<ReturnType<OAuthFetchLike>>): Promise<Record<string, unknown>> {
  const payload = JSON.parse(await response.text()) as unknown;
  const record = readRecord(payload);
  if (!record) {
    throw new AuthFnOAuthCallbackInvalidError('OAuth profile response must be a JSON object');
  }
  return record;
}

async function readJsonArray(response: Awaited<ReturnType<OAuthFetchLike>>): Promise<Array<Record<string, unknown>>> {
  const payload = JSON.parse(await response.text()) as unknown;
  if (!Array.isArray(payload)) {
    throw new AuthFnOAuthCallbackInvalidError('OAuth profile response must be a JSON array');
  }
  return payload.map((entry) => readRecord(entry) ?? {});
}

function createGlobalFetchLike(): OAuthFetchLike {
  const fetcher = globalThis.fetch;
  if (!fetcher) {
    throw new AuthFnOAuthCallbackInvalidError('global fetch is not available for GitHub profile resolution');
  }

  return async (url, init) => {
    const response = await fetcher(url, {
      method: init.method,
      headers: init.headers,
      body: init.body
    });

    return {
      ok: response.ok,
      status: response.status,
      headers: {
        get(name: string) {
          return response.headers.get(name);
        }
      },
      text: () => response.text()
    };
  };
}

function withNamespace(adapter: Adapter, namespace: string): Adapter {
  return {
    ...adapter,
    create: (params) => adapter.create({ ...params, namespace: params.namespace ?? namespace }),
    findOne: (params) => adapter.findOne({ ...params, namespace: params.namespace ?? namespace }),
    findMany: (params) => adapter.findMany({ ...params, namespace: params.namespace ?? namespace }),
    update: (params) => adapter.update({ ...params, namespace: params.namespace ?? namespace }),
    delete: (params) => adapter.delete({ ...params, namespace: params.namespace ?? namespace }),
    createMany: (params) => adapter.createMany({ ...params, namespace: params.namespace ?? namespace }),
    updateMany: (params) => adapter.updateMany({ ...params, namespace: params.namespace ?? namespace }),
    deleteMany: (params) => adapter.deleteMany({ ...params, namespace: params.namespace ?? namespace }),
    upsert: (params) => adapter.upsert({ ...params, namespace: params.namespace ?? namespace }),
    count: (params) => adapter.count({ ...params, namespace: params.namespace ?? namespace })
  } as Adapter;
}

type SocialTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
  idToken?: string;
};
