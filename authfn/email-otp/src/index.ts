import type { Route } from '@superfunctions/http';
import type {
  EmailOtpPluginConfig,
  EmailOtpPluginRuntimeConfig
} from 'authfn/plugin-types';
import type { AuthFnPlugin, AuthFnPluginRuntimeContext, AuthFnSchemaDefinition } from 'authfn';
import { createAuthFnRouteMeta, readOptionalJson } from 'authfn/http/router';
import { issueSession } from 'authfn/core/sessions';
import { jsonSuccess } from 'authfn/http/envelopes';
import { emitAuthEvent, eventRequestId } from 'authfn/core/observability';
import { sendOtpChallenge, verifyOtpChallenge } from 'authfn/core/verifications';
import { resolveEnvironment } from 'authfn/core/environment';
import { emitAccountLinkedEvent } from 'authfn/core/account-linking';
import { buildSessionResponse, type AuthFnSessionResponseMode } from 'authfn/core/session-responses';
import {
  beginTwoFactorChallenge,
  createPendingTwoFactorResponse,
  getTwoFactorPluginConfig
} from 'authfn/core/two-factor';
import { readPluginRuntimeConfig } from 'authfn/core/plugin-runtime';

export type {
  EmailOtpPluginConfig,
  EmailOtpPluginRuntimeConfig
} from 'authfn/plugin-types';

export function authFnEmailOtpPlugin(
  config: EmailOtpPluginConfig = {}
): AuthFnPlugin<'emailOtp', EmailOtpPluginRuntimeConfig, true> {
  return {
    name: 'emailOtp',
    schema: () => config.schema ?? createOtpSchema(),
    routes: (ctx) => createOtpRoutes(ctx)
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

function createOtpRoutes(ctx: AuthFnPluginRuntimeContext): Route[] {
  const runtimeConfig = readPluginRuntimeConfig<EmailOtpPluginRuntimeConfig>(ctx, 'emailOtp');

  return [
    {
      method: 'POST',
      path: '/otp/send',
      meta: createAuthFnRouteMeta('sendOtp', 'Send an email OTP challenge', {
        mode: 'none'
      }),
      handler: async (request) => {
        const body = await readOptionalJson<{
          purpose?: 'verify-email' | 'sign-in' | 'sign-up' | 'reset-password';
          email?: string;
          metadata?: Record<string, unknown>;
        }>(request);
        const result = await sendOtpChallenge(ctx.config, ctx.hooks, runtimeConfig, {
          request,
          purpose: body.purpose ?? 'verify-email',
          email: body.email ?? '',
          metadata: body.metadata
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
          purpose?: 'verify-email' | 'sign-in' | 'sign-up' | 'reset-password';
          email?: string;
          code?: string;
          profile?: Record<string, unknown>;
          sessionMode?: AuthFnSessionResponseMode;
        }>(request);
        const verification = await verifyOtpChallenge(ctx.config, ctx.hooks, runtimeConfig, {
          request,
          purpose: body.purpose ?? 'verify-email',
          email: body.email ?? '',
          code: body.code ?? '',
          profile: body.profile
        });

        if ((body.purpose === 'sign-in' || body.purpose === 'sign-up') && verification.user) {
          if (verification.createdUser) {
            const runtime = await resolveEnvironment(ctx.config, request);
            await emitAuthEvent(ctx.config, {
              type: 'authfn.user.created',
              requestId: eventRequestId(request),
              actorId: verification.user.id,
              userId: verification.user.id,
              regionId: runtime.regionId,
              outcome: 'created',
              metadata: {
                email: verification.user.primaryEmail,
                method: 'email-otp'
              }
            });
          } else if (verification.linkedExistingUser) {
            const runtime = await resolveEnvironment(ctx.config, request);
            await emitAccountLinkedEvent(ctx.config, {
              request,
              user: verification.user,
              method: 'email-otp',
              regionId: runtime.regionId,
              metadata: {
                purpose: body.purpose ?? 'verify-email'
              }
            });
          }
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
          const response = buildSessionResponse(issued, body.sessionMode);
          return jsonSuccess(request, response.data, {
            setCookies: response.setCookies
          });
        }

        return jsonSuccess(request, {
          verified: true
        });
      }
    }
  ];
}
