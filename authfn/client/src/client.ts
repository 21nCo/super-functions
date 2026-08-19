import { createAuthFnHttpClient } from './http-client.js';
import { createAuthFnSessionTransportAuth } from './transport-auth-internal.js';
import type {
  AuthFnClient,
  AuthFnClientOptions
} from './types.js';

export function createAuthFnClient(options: AuthFnClientOptions = {}): AuthFnClient {
  const http = createAuthFnHttpClient(options);

  return {
    createTransportAuth: (input) =>
      createAuthFnSessionTransportAuth({
        credentials: options.credentials,
        bearerToken: options.bearerToken,
        ...input
      }),
    getSession: () =>
      http.requestJson({
        method: 'GET',
        path: '/session'
      }),
    getAccountDetails: () =>
      http.requestJson({
        method: 'GET',
        path: '/account'
      }),
    deleteAccount: () =>
      http.requestJson({
        method: 'DELETE',
        path: '/account',
        csrf: true
      }),
    signUpWithPassword: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/sign-up/password',
        body: input
      }),
    signInWithPassword: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/sign-in/password',
        body: input
      }),
    signOut: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/sign-out',
        body: input ?? {},
        csrf: true
      }),
    listSessions: () =>
      http.requestJson({
        method: 'GET',
        path: '/sessions'
      }),
    revokeSession: (input) =>
      http.requestJson({
        method: 'POST',
        path: `/sessions/${encodeURIComponent(input.sessionId)}/revoke`,
        csrf: true
      }),
    sendOtp: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/otp/send',
        body: input
      }),
    startPasswordReset: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/password/reset/start',
        body: input
      }),
    verifyOtp: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/otp/verify',
        body: input
      }),
    completePasswordReset: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/password/reset/complete',
        body: input
      }),
    startSocialSignIn: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/social/start',
        body: input
      }),
    disconnectSocialAccount: (input) =>
      http.requestJson({
        method: 'POST',
        path: `/social/disconnect/${encodeURIComponent(input.provider)}`,
        csrf: true
      }),
    startNativeHandoff: () =>
      http.requestJson({
        method: 'POST',
        path: '/handoff/native/start',
        csrf: true
      }),
    startWebHandoff: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/handoff/web/start',
        body: input ?? {}
      }),
    createApiKey: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/api-keys',
        body: input,
        csrf: true
      }),
    listApiKeys: () =>
      http.requestJson({
        method: 'GET',
        path: '/api-keys'
      }),
    revokeApiKey: (input) =>
      http.requestJson({
        method: 'DELETE',
        path: `/api-keys/${encodeURIComponent(input.keyId)}`,
        csrf: true
      }),
    enableTwoFactor: () =>
      http.requestJson({
        method: 'POST',
        path: '/2fa/enroll',
        csrf: true
      }),
    confirmTwoFactor: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/2fa/confirm',
        body: input,
        csrf: true
      }),
    completeTwoFactorChallenge: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/2fa/challenge',
        body: input
      }),
    disableTwoFactor: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/2fa/disable',
        body: input,
        csrf: true
      }),
    lookupRegion: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/regions/lookup',
        body: input
      }),
    getEnvironment: () =>
      http.requestJson({
        method: 'GET',
        path: '/environment'
      })
  };
}
