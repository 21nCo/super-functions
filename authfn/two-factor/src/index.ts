import type { Route } from '@superfunctions/http';
import type { TwoFactorPluginConfig, TwoFactorPluginRuntimeConfig } from 'authfn/plugin-types';
import type { AuthFnPlugin, AuthFnPluginRuntimeContext, AuthFnSchemaDefinition } from 'authfn';
import {
  appendTwoFactorMethodToSession,
  confirmTwoFactorEnrollment,
  createTwoFactorEnrollment,
  disableTwoFactorEnrollment,
  satisfyTwoFactorChallenge
} from 'authfn/core/two-factor';
import { assertValidCsrf, issueSession, requireCookieSession } from 'authfn/core/sessions';
import { issueSessionCookies } from 'authfn/core/cookies';
import { createAuthFnRouteMeta } from 'authfn/http/router';
import { jsonSuccess } from 'authfn/http/envelopes';
import { emitAuthEvent, eventRequestId } from 'authfn/core/observability';
import { readPluginRuntimeConfig } from 'authfn/core/plugin-runtime';

export type {
  TwoFactorPluginConfig,
  TwoFactorPluginRuntimeConfig
} from 'authfn/plugin-types';

export function authFnTwoFactorPlugin(
  config: TwoFactorPluginConfig = {}
): AuthFnPlugin<'twoFactor', TwoFactorPluginRuntimeConfig, false> {
  return {
    name: 'twoFactor',
    schema: () => config.schema ?? createTwoFactorSchema(),
    routes: (ctx) => createTwoFactorRoutes(ctx)
  };
}

function createTwoFactorSchema(): AuthFnSchemaDefinition['schemas'] {
  return [
    {
      modelName: 'two_factor_enrollments',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        secretEncrypted: { type: 'string', required: true, fieldName: 'secret_encrypted' },
        lastUsedCounter: { type: 'number', required: false, fieldName: 'last_used_counter' },
        confirmedAt: { type: 'date', required: false, fieldName: 'confirmed_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_two_factor_enrollments_user_id',
          fields: ['userId'],
          unique: true
        }
      ]
    },
    {
      modelName: 'two_factor_recovery_codes',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        enrollmentId: { type: 'string', required: true, fieldName: 'enrollment_id' },
        codeHash: { type: 'string', required: true, fieldName: 'code_hash' },
        usedAt: { type: 'date', required: false, fieldName: 'used_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_two_factor_recovery_codes_code_hash',
          fields: ['codeHash'],
          unique: true
        },
        {
          name: 'idx_authfn_two_factor_recovery_codes_enrollment_id',
          fields: ['enrollmentId']
        }
      ]
    },
    {
      modelName: 'two_factor_challenges',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        primaryMethod: { type: 'string', required: true, fieldName: 'primary_method' },
        expiresAt: { type: 'date', required: true, fieldName: 'expires_at' },
        consumedAt: { type: 'date', required: false, fieldName: 'consumed_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_two_factor_challenges_expires_at',
          fields: ['expiresAt']
        },
        {
          name: 'idx_authfn_two_factor_challenges_user_id',
          fields: ['userId']
        }
      ]
    }
  ];
}

function createTwoFactorRoutes(ctx: AuthFnPluginRuntimeContext): Route[] {
  const config = readPluginRuntimeConfig<TwoFactorPluginRuntimeConfig>(ctx, 'twoFactor');

  return [
    {
      method: 'POST',
      path: '/2fa/enroll',
      meta: createAuthFnRouteMeta('enrollTwoFactor', 'Create a 2FA enrollment and recovery codes', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request) => {
        const state = await requireCookieSession(ctx.config, request);
        assertValidCsrf(request, state);
        const created = await createTwoFactorEnrollment(ctx.config, state.user, config);
        return jsonSuccess(request, {
          enrollmentId: created.enrollment.id,
          secret: created.secret,
          otpauthUri: created.otpauthUri,
          recoveryCodes: created.recoveryCodes
        });
      }
    },
    {
      method: 'POST',
      path: '/2fa/confirm',
      meta: createAuthFnRouteMeta('confirmTwoFactor', 'Confirm a 2FA enrollment with a valid TOTP code', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request) => {
        const state = await requireCookieSession(ctx.config, request);
        assertValidCsrf(request, state);
        const body = await request.json() as { code?: string };
        const enrollment = await confirmTwoFactorEnrollment(ctx.config, state.user.id, body.code ?? '', config);
        const methods = await appendTwoFactorMethodToSession(ctx.config, state.session.id);
        await emitAuthEvent(ctx.config, {
          type: 'authfn.2fa.enabled',
          requestId: eventRequestId(request),
          actorId: state.user.id,
          userId: state.user.id,
          sessionId: state.session.id,
          outcome: 'enabled',
          metadata: {
            enrollmentId: enrollment.id,
            methods
          }
        });
        return jsonSuccess(request, {
          enabled: true,
          enrollmentId: enrollment.id,
          sessionMethods: methods
        });
      }
    },
    {
      method: 'POST',
      path: '/2fa/challenge',
      meta: createAuthFnRouteMeta('completeTwoFactorChallenge', 'Complete a pending two-factor sign-in challenge', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await request.json() as { challengeId?: string; code?: string };
        const satisfied = await satisfyTwoFactorChallenge(
          ctx.config,
          body.challengeId ?? '',
          body.code ?? '',
          config
        );
        await emitAuthEvent(ctx.config, {
          type: 'authfn.2fa.challenged',
          requestId: eventRequestId(request),
          actorId: satisfied.user.id,
          userId: satisfied.user.id,
          outcome: 'completed',
          metadata: {
            challengeId: satisfied.challenge.id,
            primaryMethod: satisfied.challenge.primaryMethod,
            usedRecoveryCode: satisfied.usedRecoveryCode
          }
        });
        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: satisfied.user.id,
          primaryEmail: satisfied.user.primaryEmail,
          methods: satisfied.methods
        });
        const cookies = issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken);

        return jsonSuccess(request, {
          twoFactorSatisfied: true,
          session: issued.session
        }, {
          setCookies: Object.values(cookies)
        });
      }
    },
    {
      method: 'POST',
      path: '/2fa/disable',
      meta: createAuthFnRouteMeta('disableTwoFactor', 'Disable 2FA with a valid TOTP or recovery code', {
        mode: 'cookie-session',
        csrf: true
      }),
      handler: async (request) => {
        const state = await requireCookieSession(ctx.config, request);
        assertValidCsrf(request, state);
        const body = await request.json() as { code?: string };
        await disableTwoFactorEnrollment(ctx.config, state.user.id, body.code ?? '', config);
        return jsonSuccess(request, {
          disabled: true
        });
      }
    }
  ];
}
