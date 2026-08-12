import { randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Adapter, TableSchema } from '@superfunctions/db';
import type { Route } from '@superfunctions/http';
import {
  createOAuthFlowService,
  type OAuthFlowCallbackResult,
  type OAuthFlowResolvedIdentity,
  type OAuthFlowSubject,
  type OAuthFlowService,
  type OAuthProviderRuntimeConfig
} from '@superfunctions/oauth-flow';
import {
  assertCallbackStateMatches,
  consumeStateOrThrow,
  generateNonce,
  generateStateId
} from '@superfunctions/oauth-core';
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
  AuthFnValidationError,
  toAuthFnError
} from '../core/errors.js';
import { createUser, findUserById, findUserByPrimaryEmail } from '../core/users.js';
import { createAuthFnRouteMeta } from '../http/router.js';
import { jsonSuccess, resolveRequestId } from '../http/envelopes.js';
import { emitAuthEvent } from '../core/observability.js';
import {
  allowsOAuthLinkByVerifiedEmail,
  emitAccountLinkedEvent,
  emitAccountLinkingConflictEvent
} from '../core/account-linking.js';
import {
  getMultiRegionPluginConfig,
  unregisterRegionLookupForIdentifier
} from '../core/regions.js';

const SOCIAL_PROVIDER_METHODS = {
  google: 'oauth-google',
  apple: 'oauth-apple',
  github: 'oauth-github'
} as const;

const CALLBACK_METADATA_MODE = 'callbackMode';
const CALLBACK_METADATA_HANDOFF = 'handoffMode';
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

interface SocialStartBody {
  provider?: AuthFnSocialProviderId;
  returnTo?: string;
  callbackMode?: 'redirect' | 'json';
  handoffMode?: AuthFnSocialHandoffMode;
}

interface NativeAppleStartBody {
  returnTo?: string;
  handoffMode?: AuthFnSocialHandoffMode;
}

interface NativeAppleCompleteBody {
  stateId?: string;
  identityToken?: string;
  authorizationCode?: string;
  user?: {
    email?: string;
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
  device?: Record<string, unknown>;
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
  linkedExistingUser?: boolean;
}

interface ResolvedProviderSettings {
  providerId: AuthFnSocialProviderId;
  clientId: string;
  nativeClientIds: string[];
  clientSecret?: string;
  clientSecretResolver?: AuthFnSocialProviderConfig['clientSecretResolver'];
  allowlistedRedirectUris: string[];
  allowlistedReturnTo: string[];
  scopes: string[];
  linkByVerifiedEmail: boolean;
  requireExistingEmailVerifiedForLink: boolean;
  requireProviderEmailVerifiedForLink: boolean;
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
  const routes: Route[] = [
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
        const providerSettings = resolveProviderSettings(ctx.config, config, runtime, providerId, callbackUri);
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
        const providerSettings = resolveProviderSettings(ctx.config, config, runtime, providerId, callbackUri);
        const url = new URL(request.url);
        const requestId = resolveRequestId(request);
        const flowService = createSocialFlowService(ctx.config, ctx.hooks, config, request, runtime, providerId);
        const stateId = readRequiredString(url.searchParams.get('state'), 'state');
        const errorRedirectTo = await resolveOAuthCallbackErrorRedirectTarget(
          ctx.config,
          providerSettings,
          stateId
        );
        try {
        const formPostIdToken = readOptionalString(url.searchParams.get('id_token'));
        const callbackResult = providerId === 'apple' && formPostIdToken
          ? await handleAppleFormPostIdentityCallback(
            ctx.config,
            ctx.hooks,
            config,
            request,
            runtime,
            callbackUri,
            stateId,
            formPostIdToken,
            readOptionalString(url.searchParams.get('user')),
            requestId
          )
          : await flowService.handleCallback({
            providerId,
            code: readRequiredString(url.searchParams.get('code'), 'code'),
            state: stateId,
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
        if (readOptionalBoolean(resolvedIdentity.metadata?.linkedExistingUser)) {
          await emitAccountLinkedEvent(ctx.config, {
            request,
            user,
            method: SOCIAL_PROVIDER_METHODS[providerId],
            provider: providerId,
            regionId: runtime.regionId,
            metadata: {
              oauthAccountId,
              connectionId: callbackResult.connectionId
            }
          });
        }

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
        } catch (error) {
          if (errorRedirectTo) {
            const authError = toAuthFnError(error);
            await emitAuthEvent(ctx.config, {
              type: 'authfn.oauth.failed',
              requestId,
              provider: providerId,
              regionId: runtime.regionId,
              outcome: 'redirected-error',
              metadata: {
                authErrorKind: authError.code,
                authErrorMessage: authError.message,
                providerError: readOptionalString(authError.details?.error),
                providerErrorDescription: readOptionalString(authError.details?.error_description),
                returnTo: errorRedirectTo,
                debugError: isDebugErrorLoggingEnabled()
                  ? summarizeOAuthFailureError(error)
                  : undefined
              }
            });
            return redirectWithCookies(
              request,
              appendOAuthErrorToReturnTarget(errorRedirectTo, providerId, requestId, authError),
              [],
              303
            );
          }
          throw error;
        }
      }
    },
    {
      method: 'POST',
      path: '/social/callback/:provider',
      meta: createAuthFnRouteMeta('completeSocialSignInFormPost', 'Complete social OAuth sign-in via form_post', {
        mode: 'none'
      }),
      handler: async (request, context) => {
        const callbackRoute = routes.find((route) =>
          route.method === 'GET' && route.path === '/social/callback/:provider'
        );
        if (!callbackRoute) {
          throw new AuthFnError('AUTHFN_INTERNAL_ERROR', 'Social OAuth callback handler is not registered', {
            status: 500,
            retryable: true
          });
        }
        return callbackRoute.handler(await createFormPostCallbackRequest(request), context);
      }
    },
    {
      method: 'POST',
      path: '/social/native/apple/start',
      meta: createAuthFnRouteMeta('startNativeAppleSignIn', 'Start native Apple sign-in', {
        mode: 'none'
      }),
      handler: async (request) => {
        const runtime = await resolveRuntime(ctx.config, request);
        const body = await request.json().catch(() => ({})) as NativeAppleStartBody;
        const providerId = 'apple';
        const callbackUri = buildCallbackUri(runtime.baseUrl, ctx.basePath, providerId);
        const providerSettings = resolveProviderSettings(ctx.config, config, runtime, providerId, callbackUri);
        const returnTo = readOptionalString(body.returnTo);
        const handoffMode = normalizeHandoffMode(readOptionalString(body.handoffMode) ?? 'session-token');
        assertAllowedReturnTarget(providerSettings, returnTo, 'json');

        const requestId = resolveRequestId(request);
        const issuedAt = config.now?.() ?? new Date();
        const createdAt = issuedAt.toISOString();
        const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000).toISOString();
        const stateId = generateStateId();
        const nonce = generateNonce();
        const stateStore = new DbAdapterOAuthStateStore(
          withNamespace(ctx.config.database, ctx.config.namespace ?? 'authfn')
        );

        await stateStore.put({
          stateId,
          providerId,
          redirectUri: callbackUri,
          requestedScopes: providerSettings.scopes,
          subject: {
            kind: 'browser-auth',
            intentId: createIdentifier('intent'),
            regionId: runtime.regionId,
            returnTo,
            metadata: {
              [CALLBACK_METADATA_MODE]: 'json',
              [CALLBACK_METADATA_HANDOFF]: handoffMode,
              nativeProvider: 'apple'
            }
          },
          nonce,
          createdAt,
          expiresAt
        });

        await emitAuthEvent(ctx.config, {
          type: 'authfn.oauth.started',
          requestId,
          provider: providerId,
          regionId: runtime.regionId,
          outcome: 'started',
          metadata: {
            stateId,
            callbackMode: 'json',
            handoffMode,
            nativeProvider: 'apple'
          }
        });

        return jsonSuccess(request, {
          provider: providerId,
          stateId,
          nonce,
          expiresAt
        });
      }
    },
    {
      method: 'POST',
      path: '/social/native/apple/complete',
      meta: createAuthFnRouteMeta('completeNativeAppleSignIn', 'Complete native Apple sign-in', {
        mode: 'none'
      }),
      handler: async (request) => {
        const runtime = await resolveRuntime(ctx.config, request);
        const body = await request.json() as NativeAppleCompleteBody;
        const requestId = resolveRequestId(request);
        const stateId = readRequiredString(body.stateId, 'stateId');
        const identityToken = readRequiredString(body.identityToken, 'identityToken');
        const callbackUri = buildCallbackUri(runtime.baseUrl, ctx.basePath, 'apple');
        const providerSettings = resolveProviderSettings(ctx.config, config, runtime, 'apple', callbackUri);
        const stateStore = new DbAdapterOAuthStateStore(
          withNamespace(ctx.config.database, ctx.config.namespace ?? 'authfn')
        );
        const consumedState = await consumeStateOrThrow(
          stateStore,
          stateId,
          (config.now?.() ?? new Date()).toISOString()
        );
        assertCallbackStateMatches(
          {
            providerId: 'apple',
            redirectUri: callbackUri
          },
          consumedState
        );

        const profile = await resolveAppleNativeProfile(
          identityToken,
          body.user,
          consumedState.nonce,
          [providerSettings.clientId, ...providerSettings.nativeClientIds]
        );
        const resolved = await resolveLocalIdentityFromProfile(
          ctx.config,
          ctx.hooks,
          request,
          runtime,
          'apple',
          providerSettings,
          profile
        );
        const account = await upsertOAuthAccount(ctx.config, {
          userId: resolved.user.id,
          provider: 'apple',
          providerAccountId: profile.providerAccountId,
          connectionId: resolved.connectionId,
          email: profile.email,
          profile: profile.profile
        });
        const user = resolved.user;
        const twoFactorConfig = getTwoFactorPluginConfig(ctx.config);
        if (twoFactorConfig) {
          const pendingChallenge = await beginTwoFactorChallenge(
            ctx.config,
            user,
            SOCIAL_PROVIDER_METHODS.apple,
            twoFactorConfig
          );
          if (pendingChallenge) {
            throw createPendingTwoFactorResponse(pendingChallenge.challenge);
          }
        }

        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: user.id,
          primaryEmail: user.primaryEmail,
          regionId: runtime.regionId,
          methods: [SOCIAL_PROVIDER_METHODS.apple]
        });
        const isNewUser = !resolved.existingAccountId && !resolved.linkedExistingUser;

        await ctx.hooks.afterOAuthCallback?.(
          buildHookContext(ctx.config, request, runtime, user.id, issued.session),
          {
            provider: 'apple',
            linked: true,
            callbackMode: 'json',
            handoffMode: 'session-token',
            session: issued.session,
            userId: user.id,
            oauthAccountId: account.id,
            connectionId: resolved.connectionId
          } as unknown as Record<string, unknown>
        );

        await emitAuthEvent(ctx.config, {
          type: 'authfn.oauth.completed',
          requestId,
          actorId: user.id,
          sessionId: issued.session.id,
          userId: user.id,
          regionId: runtime.regionId,
          provider: 'apple',
          outcome: resolved.linkedExistingUser ? 'linked-existing-user' : 'linked',
          metadata: {
            callbackMode: 'json',
            handoffMode: 'session-token',
            oauthAccountId: account.id,
            connectionId: resolved.connectionId,
            nativeProvider: 'apple',
            isNewUser
          }
        });
        if (resolved.linkedExistingUser) {
          await emitAccountLinkedEvent(ctx.config, {
            request,
            user,
            method: SOCIAL_PROVIDER_METHODS.apple,
            provider: 'apple',
            regionId: runtime.regionId,
            metadata: {
              oauthAccountId: account.id,
              connectionId: resolved.connectionId,
              nativeProvider: 'apple',
              isNewUser
            }
          });
        }

        return jsonSuccess(request, {
          provider: 'apple',
          linked: true,
          isNewUser,
          token: issued.sessionToken,
          session: issued.session,
          sessionId: issued.session.id,
          regionId: issued.session.regionId ?? runtime.regionId,
          expiresAt: issued.session.expiresAt?.toISOString() ?? null,
          userId: user.id,
          oauthAccountId: account.id
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
        resolveProviderSettings(ctx.config, config, runtime, providerId, callbackUri);
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
  return routes;
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
  const settings = resolveProviderSettings(config, pluginConfig, runtime, activeProviderId, callbackUri);
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
          persistTokens: false,
          metadata: {
            oauthAccountId: resolved.existingAccountId,
            linkedExistingUser: resolved.linkedExistingUser,
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

async function handleAppleFormPostIdentityCallback(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  pluginConfig: SocialOAuthPluginConfig,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  callbackUri: string,
  stateId: string,
  idToken: string,
  userPayload: string | undefined,
  requestId: string
): Promise<OAuthFlowCallbackResult> {
  const stateStore = new DbAdapterOAuthStateStore(
    withNamespace(config.database, config.namespace ?? 'authfn')
  );
  const consumedState = await consumeStateOrThrow(
    stateStore,
    stateId,
    (pluginConfig.now?.() ?? new Date()).toISOString()
  );
  assertCallbackStateMatches(
    {
      providerId: 'apple',
      redirectUri: callbackUri
    },
    consumedState
  );

  const subject = toOAuthFlowSubject(consumedState);
  const providerSettings = resolveProviderSettings(config, pluginConfig, runtime, 'apple', callbackUri);
  const claims = await verifyAppleIdentityToken(idToken, providerSettings.clientId);
  const profile = resolveAppleFormPostProfile(claims, userPayload, consumedState.nonce);
  const resolved = await resolveLocalIdentityFromProfile(
    config,
    hooks,
    request,
    runtime,
    'apple',
    providerSettings,
    profile
  );
  const account = await upsertOAuthAccount(config, {
    userId: resolved.user.id,
    provider: 'apple',
    providerAccountId: profile.providerAccountId,
    connectionId: resolved.connectionId,
    email: profile.email,
    profile: profile.profile
  });

  return {
    providerId: 'apple',
    subject,
    tokenSet: {
      accessToken: `apple_form_post_${requestId}`,
      idToken,
      tokenType: 'Bearer'
    },
    connectionId: resolved.connectionId,
    resolvedIdentity: {
      tenantId: config.namespace ?? 'authfn',
      userId: resolved.user.id,
      connectionId: resolved.connectionId,
      persistTokens: false,
      metadata: {
        oauthAccountId: account.id,
        linkedExistingUser: resolved.linkedExistingUser,
        profile: buildOAuthAccountProfile('apple', profile)
      }
    }
  };
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
    config,
    pluginConfig,
    runtime,
    providerId,
    buildCallbackUri(runtime.baseUrl, config.basePath ?? '/auth', providerId)
  );
  const profile = await resolveProviderProfile(providerId, tokenSet, request, runtime, providerSettings, pluginConfig.fetcher);
  return resolveLocalIdentityFromProfile(
    config,
    hooks,
    request,
    runtime,
    providerId,
    providerSettings,
    profile
  );
}

async function resolveLocalIdentityFromProfile(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  request: Request,
  runtime: AuthFnRuntimeResolution,
  providerId: AuthFnSocialProviderId,
  providerSettings: ResolvedProviderSettings,
  profile: AuthFnSocialProfile
): Promise<ResolvedSocialIdentity> {
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
      const providerEmailAccepted = providerSettings.requireProviderEmailVerifiedForLink
        ? profile.emailVerified === true
        : true;
      const existingEmailAccepted = providerSettings.requireExistingEmailVerifiedForLink
        ? Boolean(existingUser.emailVerifiedAt)
        : true;
      if (providerSettings.linkByVerifiedEmail && providerEmailAccepted && existingEmailAccepted) {
        return {
          user: existingUser,
          profile: {
            ...profile,
            email: normalizedEmail
          },
          connectionId: createConnectionId(providerId, existingUser.id),
          linkedExistingUser: true
        };
      }

      await emitAccountLinkingConflictEvent(config, {
        request,
        user: existingUser,
        provider: providerId,
        regionId: runtime.regionId,
        method: SOCIAL_PROVIDER_METHODS[providerId],
        reason: !providerSettings.linkByVerifiedEmail
          ? 'oauth_verified_email_linking_disabled'
          : !providerEmailAccepted
            ? 'provider_email_unverified'
            : 'existing_email_unverified',
        metadata: {
          providerEmailVerified: profile.emailVerified === true,
          requireProviderEmailVerified: providerSettings.requireProviderEmailVerifiedForLink,
          requireExistingEmailVerified: providerSettings.requireExistingEmailVerifiedForLink
        }
      });
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
  } catch (afterHookError) {
    if (afterHookError instanceof AuthFnError) {
      await rollbackSocialUser(config, user.id, user.primaryEmail);
      throw afterHookError;
    }
    // Fail-open by hook contract.
  }

  return user;
}

async function rollbackSocialUser(
  config: Pick<AuthFnConfig, 'cacheStore' | 'database' | 'namespace' | 'plugins'>,
  userId: string,
  primaryEmail?: string | null
): Promise<void> {
  const multiRegion = getMultiRegionPluginConfig(config);
  if (primaryEmail && multiRegion) {
    await unregisterRegionLookupForIdentifier(config, multiRegion, primaryEmail).catch(() => undefined);
  }

  await config.database.deleteMany({
    model: 'region_profiles',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: config.namespace ?? 'authfn'
  }).catch(() => undefined);

  await config.database.delete({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: userId }],
    namespace: config.namespace ?? 'authfn'
  }).catch(() => undefined);
}

function resolveProviderSettings(
  authConfig: Pick<AuthFnConfig, 'accountLinking'>,
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

  const verifiedEmailLinking = allowsOAuthLinkByVerifiedEmail(authConfig, providerId);
  const providerLinkOverride = staticConfig.linkByVerifiedEmail;
  const hasRuntimeNativeClientIds = Object.prototype.hasOwnProperty.call(runtimeConfig, 'nativeClientIds');

  return {
    providerId,
    clientId,
    nativeClientIds: hasRuntimeNativeClientIds
      ? readStringArray(runtimeConfig.nativeClientIds) ?? []
      : readStringArray(staticConfig.nativeClientIds) ?? [],
    clientSecret: readOptionalString(runtimeConfig.clientSecret) ?? staticConfig.clientSecret,
    clientSecretResolver: readResolver(runtimeConfig.clientSecretResolver) ?? staticConfig.clientSecretResolver,
    allowlistedRedirectUris: readStringArray(runtimeConfig.allowlistedRedirectUris)
      ?? readStringArray(staticConfig.allowlistedRedirectUris)
      ?? [callbackUri],
    allowlistedReturnTo: readStringArray(runtimeConfig.allowlistedReturnTo)
      ?? readStringArray(staticConfig.allowlistedReturnTo)
      ?? [],
    scopes: readStringArray(runtimeConfig.scopes)
      ?? readStringArray(staticConfig.scopes)
      ?? getOAuthProviderDescriptor(providerId).defaultScopes,
    linkByVerifiedEmail: providerLinkOverride ?? verifiedEmailLinking.allowed,
    requireExistingEmailVerifiedForLink: verifiedEmailLinking.requireExistingEmailVerified,
    requireProviderEmailVerifiedForLink: verifiedEmailLinking.requireProviderEmailVerified,
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

function resolveAppleFormPostProfile(
  verifiedClaims: JWTPayload,
  userPayload: string | undefined,
  expectedNonce: string | undefined
): AuthFnSocialProfile {
  const claims = readIdTokenClaims(verifiedClaims as Record<string, unknown>);
  if (!claims.sub) {
    throw new AuthFnOAuthCallbackInvalidError('Apple OAuth form_post callback missing subject claim', {
      provider: 'apple'
    });
  }

  if (!expectedNonce || claims.nonce !== expectedNonce) {
    throw new AuthFnOAuthCallbackInvalidError('Apple OAuth form_post nonce mismatch', {
      provider: 'apple'
    });
  }

  const user = parseAppleUserPayload(userPayload);
  const email = normalizeEmail(user?.email ?? claims.email);
  if (!email) {
    throw new AuthFnOAuthCallbackInvalidError('Apple OAuth form_post callback missing email claim', {
      provider: 'apple'
    });
  }

  const name = resolveAppleDisplayName(user) ?? claims.name;
  return {
    providerAccountId: claims.sub,
    email,
    emailVerified: claims.emailVerified ?? true,
    name,
    profile: cleanObject({
      sub: claims.sub,
      email,
      emailVerified: claims.emailVerified ?? true,
      name,
      firstName: user?.name?.firstName,
      lastName: user?.name?.lastName
    })
  };
}

async function resolveAppleNativeProfile(
  identityToken: string,
  userPayload: NativeAppleCompleteBody['user'] | undefined,
  expectedNonce: string | undefined,
  audience: string | string[]
): Promise<AuthFnSocialProfile> {
  const claims = await verifyAppleIdentityToken(identityToken, audience);
  const subject = readOptionalString(claims.sub);
  if (!subject) {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token missing subject claim', {
      provider: 'apple'
    });
  }

  const nonce = readOptionalString(claims.nonce);
  if (!expectedNonce || nonce !== expectedNonce) {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token nonce mismatch', {
      provider: 'apple'
    });
  }

  const email = normalizeEmail(readOptionalString(claims.email) ?? userPayload?.email);
  if (!email) {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token missing email claim', {
      provider: 'apple'
    });
  }

  const firstName = readOptionalString(userPayload?.name?.firstName);
  const lastName = readOptionalString(userPayload?.name?.lastName);
  const payloadName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const name = readOptionalString(claims.name) ?? (payloadName || undefined);
  const emailVerified = readBooleanClaim(claims.email_verified) ?? true;

  return {
    providerAccountId: subject,
    email,
    emailVerified,
    name,
    profile: cleanObject({
      sub: subject,
      email,
      emailVerified,
      name,
      firstName,
      lastName,
      isPrivateEmail: readBooleanClaim(claims.is_private_email)
    })
  };
}

async function verifyAppleIdentityToken(
  identityToken: string,
  audience: string | string[]
): Promise<JWTPayload> {
  if (isUnsignedTestToken(identityToken)) {
    const claims = parseRawIdTokenPayload(identityToken);
    assertAppleTokenAudience(claims, audience);
    return claims;
  }

  try {
    const result = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience
    });
    return result.payload;
  } catch (error) {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token verification failed', {
      provider: 'apple',
      reason: error instanceof Error ? error.message : 'verification_failed'
    });
  }
}

function assertAppleTokenAudience(claims: JWTPayload, audience: string | string[]): void {
  const accepted = Array.isArray(audience) ? audience : [audience];
  const tokenAudiences = Array.isArray(claims.aud)
    ? claims.aud
    : typeof claims.aud === 'string'
      ? [claims.aud]
      : [];
  if (!tokenAudiences.some((aud) => accepted.includes(aud))) {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token verification failed', {
      provider: 'apple',
      reason: 'unexpected "aud" claim value'
    });
  }
}

function isUnsignedTestToken(identityToken: string): boolean {
  if (!allowUnsignedAppleTokensForTests()) {
    return false;
  }
  try {
    const [header] = identityToken.split('.');
    const parsed = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as Record<string, unknown>;
    return parsed.alg === 'none';
  } catch {
    return false;
  }
}

function allowUnsignedAppleTokensForTests(): boolean {
  const env = (globalThis as unknown as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }).process?.env;
  return env?.AUTHFN_ALLOW_UNSIGNED_APPLE_TOKENS === 'true' || env?.NODE_ENV === 'test';
}

function parseRawIdTokenPayload(identityToken: string): JWTPayload {
  const parts = identityToken.split('.');
  if (parts.length < 2) {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token is malformed', {
      provider: 'apple'
    });
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JWTPayload;
  } catch {
    throw new AuthFnOAuthCallbackInvalidError('Apple native identity token payload is malformed', {
      provider: 'apple'
    });
  }
}

function parseAppleUserPayload(value: string | undefined): {
  email?: string;
  name?: {
    firstName?: string;
    lastName?: string;
  };
} | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const name = readRecord(parsed.name);
    return {
      email: readOptionalString(parsed.email),
      name: name
        ? {
            firstName: readOptionalString(name.firstName),
            lastName: readOptionalString(name.lastName)
          }
        : undefined
    };
  } catch {
    return undefined;
  }
}

function resolveAppleDisplayName(user: ReturnType<typeof parseAppleUserPayload>): string | undefined {
  const name = [
    user?.name?.firstName,
    user?.name?.lastName
  ].filter(Boolean).join(' ').trim();
  return name || undefined;
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

async function resolveOAuthCallbackErrorRedirectTarget(
  config: AuthFnConfig,
  settings: ResolvedProviderSettings,
  stateId: string
): Promise<string | undefined> {
  const stateStore = new DbAdapterOAuthStateStore(
    withNamespace(config.database, config.namespace ?? 'authfn')
  );
  const state = await stateStore.get(stateId);
  const subject = state?.subject;
  if (!subject || subject.kind !== 'browser-auth') {
    return undefined;
  }

  const callbackMode = normalizeCallbackMode(
    readOptionalString(subject.metadata?.[CALLBACK_METADATA_MODE])
      ?? inferCallbackMode(subject.returnTo)
  );
  if (callbackMode !== 'redirect' || !subject.returnTo) {
    return undefined;
  }

  assertAllowedReturnTarget(settings, subject.returnTo, 'redirect');
  return subject.returnTo;
}

function appendOAuthErrorToReturnTarget(
  returnTo: string,
  providerId: AuthFnSocialProviderId,
  requestId: string,
  error: AuthFnError
): string {
  const url = new URL(returnTo);
  url.searchParams.set('auth_error', 'oauth_callback_failed');
  url.searchParams.set('auth_error_code', error.code);
  url.searchParams.set('auth_provider', providerId);
  url.searchParams.set('auth_request_id', requestId);
  return url.toString();
}

function isDebugErrorLoggingEnabled(): boolean {
  const globalProcess = globalThis as unknown as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };
  return globalProcess.process?.env?.AUTHFN_DEBUG_ERRORS === 'true';
}

function summarizeOAuthFailureError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return {
      type: typeof error,
      message: String(error)
    };
  }

  const raw = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    status?: unknown;
    retryable?: unknown;
    details?: Record<string, unknown>;
    cause?: unknown;
  };

  return {
    name: error instanceof Error ? error.name : raw.name,
    code: raw.code,
    message: error instanceof Error ? error.message : raw.message,
    status: raw.status,
    retryable: raw.retryable,
    details: sanitizeOAuthFailureDetails(raw.details),
    cause: summarizeErrorCause(raw.cause)
  };
}

function summarizeErrorCause(cause: unknown): Record<string, unknown> | string | undefined {
  if (!cause) {
    return undefined;
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message
    };
  }
  if (typeof cause === 'string') {
    return cause;
  }
  if (typeof cause === 'object') {
    const raw = cause as Record<string, unknown>;
    return {
      name: raw.name,
      code: raw.code,
      message: raw.message
    };
  }
  return String(cause);
}

function sanitizeOAuthFailureDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      isSensitiveOAuthFailureKey(key) ? '[REDACTED]' : sanitizeOAuthFailureValue(value)
    ])
  );
}

function sanitizeOAuthFailureValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeOAuthFailureValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        isSensitiveOAuthFailureKey(key) ? '[REDACTED]' : sanitizeOAuthFailureValue(entry)
      ])
    );
  }
  return value;
}

function isSensitiveOAuthFailureKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return [
    'access_token',
    'accesstoken',
    'authorization',
    'client_secret',
    'clientsecret',
    'code',
    'cookie',
    'id_token',
    'idtoken',
    'password',
    'privatekey',
    'refresh_token',
    'refreshtoken',
    'secret',
    'set-cookie',
    'token'
  ].some((sensitive) => normalized.includes(sensitive));
}

async function createFormPostCallbackRequest(request: Request): Promise<Request> {
  const form = await request.formData();
  const url = new URL(request.url);
  const code = readFormDataString(form.get('code'));
  const state = readFormDataString(form.get('state'));
  const idToken = readFormDataString(form.get('id_token'));
  const user = readFormDataString(form.get('user'));
  if (code) {
    url.searchParams.set('code', code);
  }
  if (state) {
    url.searchParams.set('state', state);
  }
  if (idToken) {
    url.searchParams.set('id_token', idToken);
  }
  if (user) {
    url.searchParams.set('user', user);
  }

  const headers = new Headers();
  const requestId = request.headers.get('x-request-id');
  if (requestId) {
    headers.set('x-request-id', requestId);
  }
  return new Request(url.toString(), {
    method: 'GET',
    headers
  });
}

function readFormDataString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function buildSessionHandoffPayload(
  issued: Awaited<ReturnType<typeof issueSession>>
): Record<string, unknown> {
  return {
    type: 'session-token',
    token: issued.sessionToken,
    sessionId: issued.session.id,
    regionId: issued.session.regionId ?? null,
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
  if (issued.session.regionId) {
    fragment.set('regionId', issued.session.regionId);
  }
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

  if (!isReturnTargetAllowlisted(returnTo, settings.allowlistedReturnTo)) {
    throw new AuthFnRedirectUriDisallowedError('Redirect target is not allowlisted', {
      provider: settings.providerId,
      returnTo
    });
  }
}

function isReturnTargetAllowlisted(returnTo: string, allowlist: string[]): boolean {
  if (allowlist.includes(returnTo)) {
    return true;
  }

  let target: URL;
  try {
    target = new URL(returnTo);
  } catch {
    return false;
  }

  return allowlist.some((entry) => {
    try {
      const allowed = new URL(entry);
      const allowsOrigin =
        (allowed.pathname === '/' || allowed.pathname === '')
        && !allowed.search
        && !allowed.hash;
      return allowsOrigin && allowed.origin === target.origin;
    } catch {
      return false;
    }
  });
}

function buildCallbackUri(baseUrl: string, basePath: string, providerId: AuthFnSocialProviderId): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return `${normalizedBase}${normalizedPath}/social/callback/${providerId}`;
}

function toOAuthFlowSubject(state: {
  subject?: unknown;
  tenantId?: string;
  userId?: string;
  connectionId?: string;
  intentId?: string;
  regionId?: string;
  returnTo?: string;
  metadata?: Record<string, unknown>;
}): OAuthFlowSubject {
  const subject = state.subject;
  if (subject && typeof subject === 'object') {
    const record = subject as Record<string, unknown>;
    if (record.kind === 'connection') {
      return {
        kind: 'connection',
        tenantId: readOptionalString(record.tenantId),
        userId: readOptionalString(record.userId),
        connectionId: readOptionalString(record.connectionId)
      };
    }
    if (record.kind === 'browser-auth') {
      return {
        kind: 'browser-auth',
        tenantId: readOptionalString(record.tenantId),
        intentId: readOptionalString(record.intentId),
        regionId: readOptionalString(record.regionId),
        returnTo: readOptionalString(record.returnTo),
        metadata: readRecord(record.metadata)
      };
    }
  }

  if (state.intentId) {
    return {
      kind: 'browser-auth',
      tenantId: state.tenantId,
      intentId: state.intentId,
      regionId: state.regionId,
      returnTo: state.returnTo,
      metadata: state.metadata
    };
  }

  return {
    kind: 'connection',
    tenantId: state.tenantId,
    userId: state.userId,
    connectionId: state.connectionId
  };
}

function parseIdTokenClaims(idToken: string | undefined): {
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  nonce?: string;
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
    return readIdTokenClaims(payload);
  } catch {
    return {};
  }
}

function readIdTokenClaims(payload: Record<string, unknown>): {
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  nonce?: string;
} {
  const fallbackName = [
    readOptionalString(payload.given_name),
    readOptionalString(payload.family_name)
  ].filter(Boolean).join(' ').trim();
  return {
    sub: readOptionalString(payload.sub),
    email: readOptionalString(payload.email),
    emailVerified: readBooleanClaim(payload.email_verified),
    name: readOptionalString(payload.name) ?? (fallbackName || undefined),
    nonce: readOptionalString(payload.nonce)
  };
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

function readBooleanClaim(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') {
      return true;
    }
    if (value.toLowerCase() === 'false') {
      return false;
    }
  }
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries : undefined;
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
