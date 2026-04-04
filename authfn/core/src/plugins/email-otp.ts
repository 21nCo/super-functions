import type { Route } from '@superfunctions/http';
import type { EmailOtpPluginConfig } from '../plugin-types.js';
import type { AuthFnPlugin, AuthFnPluginRuntimeContext, AuthFnSchemaDefinition } from '../types.js';
import { createAuthFnRouteMeta, readOptionalJson } from '../http/router.js';
import { issueSession } from '../core/sessions.js';
import { issueSessionCookies } from '../core/cookies.js';
import { jsonSuccess } from '../http/envelopes.js';
import { emitAuthEvent, eventRequestId } from '../core/observability.js';
import { sendOtpChallenge, verifyOtpChallenge } from '../core/verifications.js';
import {
  beginTwoFactorChallenge,
  createPendingTwoFactorResponse,
  getTwoFactorPluginConfig
} from '../core/two-factor.js';

export function authFnEmailOtpPlugin(config: EmailOtpPluginConfig = {}): AuthFnPlugin {
  return {
    name: 'emailOtp',
    schema: () => config.schema ?? createOtpSchema(),
    routes: (ctx) => createOtpRoutes(ctx, config)
  };
}

function createOtpSchema(): AuthFnSchemaDefinition['schemas'] {
  return [
    {
      modelName: 'otp_challenges',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        purpose: { type: 'string', required: true, fieldName: 'purpose' },
        email: { type: 'string', required: true, fieldName: 'email' },
        codeHash: { type: 'string', required: true, fieldName: 'code_hash' },
        attemptCount: { type: 'number', required: true, fieldName: 'attempt_count' },
        deliveryMetadata: { type: 'json', required: false, fieldName: 'delivery_metadata' },
        expiresAt: { type: 'date', required: true, fieldName: 'expires_at' },
        consumedAt: { type: 'date', required: false, fieldName: 'consumed_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_otp_challenges_email_purpose_created_at',
          fields: ['email', 'purpose', 'createdAt']
        },
        {
          name: 'idx_authfn_otp_challenges_expires_at',
          fields: ['expiresAt']
        }
      ]
    }
  ];
}

function createOtpRoutes(
  ctx: AuthFnPluginRuntimeContext,
  config: EmailOtpPluginConfig
): Route[] {
  return [
    {
      method: 'POST',
      path: '/otp/send',
      meta: createAuthFnRouteMeta('sendOtp', 'Send an email OTP challenge', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await readOptionalJson<{
          purpose?: 'verify-email' | 'sign-in' | 'reset-password';
          email?: string;
        }>(request);
        const result = await sendOtpChallenge(ctx.config, ctx.hooks, config, {
          request,
          purpose: body.purpose ?? 'verify-email',
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
      path: '/otp/verify',
      meta: createAuthFnRouteMeta('verifyOtp', 'Verify an email OTP challenge', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await readOptionalJson<{
          purpose?: 'verify-email' | 'sign-in' | 'reset-password';
          email?: string;
          code?: string;
        }>(request);
        const verification = await verifyOtpChallenge(ctx.config, config, {
          request,
          purpose: body.purpose ?? 'verify-email',
          email: body.email ?? '',
          code: body.code ?? ''
        });

        if (body.purpose === 'sign-in' && verification.user) {
          const twoFactorConfig = getTwoFactorPluginConfig(ctx.config);
          if (twoFactorConfig) {
            const challenge = await beginTwoFactorChallenge(
              ctx.config,
              verification.user,
              'email-otp',
              twoFactorConfig
            );
            if (challenge) {
              await emitAuthEvent(ctx.config, {
                type: 'authfn.2fa.challenged',
                requestId: eventRequestId(request),
                actorId: verification.user.id,
                userId: verification.user.id,
                outcome: 'required',
                metadata: {
                  challengeId: challenge.challenge.id,
                  primaryMethod: 'email-otp'
                }
              });
              throw createPendingTwoFactorResponse(challenge.challenge);
            }
          }
          const issued = await issueSession(ctx.config, ctx.hooks, {
            request,
            userId: verification.user.id,
            primaryEmail: verification.user.primaryEmail,
            methods: ['email-otp']
          });
          const cookies = issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken);
          return jsonSuccess(request, {
            session: issued.session
          }, {
            setCookies: Object.values(cookies)
          });
        }

        return jsonSuccess(request, {
          verified: true
        });
      }
    }
  ];
}
