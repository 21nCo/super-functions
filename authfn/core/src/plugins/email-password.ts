import type { Route } from '@superfunctions/http';
import type { PasswordPluginConfig } from '../plugin-types.js';
import type { AuthFnPlugin, AuthFnPluginRuntimeContext, AuthFnSchemaDefinition } from '../types.js';
import { createAuthFnRouteMeta, readOptionalJson } from '../http/router.js';
import { issueSession } from '../core/sessions.js';
import { issueSessionCookies } from '../core/cookies.js';
import { resolveRuntime } from '../core/runtime.js';
import { signInWithPassword, signUpWithPassword } from '../core/passwords.js';
import { jsonSuccess } from '../http/envelopes.js';
import { completeResetPassword, sendOtpChallenge } from '../core/verifications.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';
import {
  beginTwoFactorChallenge,
  createPendingTwoFactorResponse,
  getTwoFactorPluginConfig
} from '../core/two-factor.js';

export function authFnPasswordPlugin(config: PasswordPluginConfig & {
  otp?: {
    delivery?: import('../types.js').AuthFnDeliveryProvider;
    codeGenerator?: () => string;
    now?: () => Date;
    challengeTtlSeconds?: number;
    maxAttempts?: number;
  };
} = {}): AuthFnPlugin {
  return {
    name: 'password',
    schema: () => config.schema ?? createPasswordSchema(),
    routes: (ctx) => createPasswordRoutes(ctx, config)
  };
}

function createPasswordSchema(): AuthFnSchemaDefinition['schemas'] {
  return [
    {
      modelName: 'password_credentials',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        passwordHash: { type: 'string', required: true, fieldName: 'password_hash' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_password_credentials_user_id',
          fields: ['userId'],
          unique: true
        }
      ]
    }
  ];
}

function createPasswordRoutes(
  ctx: AuthFnPluginRuntimeContext,
  config: PasswordPluginConfig & {
    otp?: {
      delivery?: import('../types.js').AuthFnDeliveryProvider;
      codeGenerator?: () => string;
      now?: () => Date;
      challengeTtlSeconds?: number;
      maxAttempts?: number;
    };
  }
): Route[] {
  return [
    {
      method: 'POST',
      path: '/sign-up/password',
      meta: createAuthFnRouteMeta('signUpWithPassword', 'Create a user and session using email/password', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await readOptionalJson<{
          email?: string;
          password?: string;
          profile?: Record<string, unknown>;
        }>(request);
        const runtime = await resolveRuntime(ctx.config, request);
        const result = await signUpWithPassword(ctx.config, ctx.hooks, {
          email: body.email ?? '',
          password: body.password ?? '',
          profile: body.profile
        }, {
          request,
          runtime,
          policy: {
            compromisedPasswordChecker: config.compromisedPasswordChecker
          }
        });
        await emitAuthEvent(ctx.config, {
          type: 'authfn.user.created',
          requestId: eventRequestId(request),
          actorId: result.user.id,
          userId: result.user.id,
          regionId: runtime.regionId,
          outcome: 'created',
          metadata: {
            email: result.user.primaryEmail
          }
        });
        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: result.user.id,
          primaryEmail: result.user.primaryEmail,
          methods: ['password']
        });
        const cookies = issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken);

        return jsonSuccess(request, {
          session: issued.session
        }, {
          setCookies: Object.values(cookies)
        });
      }
    },
    {
      method: 'POST',
      path: '/password/reset/start',
      meta: createAuthFnRouteMeta('startPasswordReset', 'Start an OTP-backed password reset flow', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await readOptionalJson<{
          email?: string;
        }>(request);
        const result = await sendOtpChallenge(ctx.config, ctx.hooks, config.otp ?? {}, {
          request,
          purpose: 'reset-password',
          email: body.email ?? ''
        });

        return jsonSuccess(request, {
          challengeId: result.challenge.id,
          sent: result.delivery.sent
        });
      }
    },
    {
      method: 'POST',
      path: '/password/reset/complete',
      meta: createAuthFnRouteMeta('completePasswordReset', 'Complete a password reset with a valid OTP challenge', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await request.json() as {
          email?: string;
          code?: string;
          newPassword?: string;
        };
        const result = await completeResetPassword(ctx.config, {
          ...(config.otp ?? {}),
          passwordPolicy: {
            compromisedPasswordChecker: config.compromisedPasswordChecker
          }
        }, {
          purpose: 'reset-password',
          email: body.email ?? '',
          code: body.code ?? '',
          newPassword: body.newPassword ?? '',
          request
        });

        return jsonSuccess(request, result);
      }
    },
    {
      method: 'POST',
      path: '/sign-in/password',
      meta: createAuthFnRouteMeta('signInWithPassword', 'Sign in and issue a session using email/password', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await request.json() as {
          email?: string;
          password?: string;
        };
        const result = await signInWithPassword(ctx.config, {
          email: body.email ?? '',
          password: body.password ?? ''
        }, {
          requireEmailVerifiedForSignIn: config.requireEmailVerifiedForSignIn
        });
        const twoFactorConfig = getTwoFactorPluginConfig(ctx.config);
        if (twoFactorConfig) {
          const challenge = await beginTwoFactorChallenge(
            ctx.config,
            result.user,
            'password',
            twoFactorConfig
          );
          if (challenge) {
            await emitAuthEvent(ctx.config, {
              type: 'authfn.2fa.challenged',
              requestId: eventRequestId(request),
              actorId: result.user.id,
              userId: result.user.id,
              outcome: 'required',
              metadata: {
                challengeId: challenge.challenge.id,
                primaryMethod: 'password'
              }
            });
            throw createPendingTwoFactorResponse(challenge.challenge);
          }
        }
        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: result.user.id,
          primaryEmail: result.user.primaryEmail,
          methods: ['password']
        });
        const cookies = issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken);

        return jsonSuccess(request, {
          session: issued.session
        }, {
          setCookies: Object.values(cookies)
        });
      }
    }
  ];
}
