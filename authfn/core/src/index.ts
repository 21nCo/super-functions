import type { AuthProvider } from '@superfunctions/auth';
import { createPluginRunner } from './plugin-runner.js';
import { createAuthFnRouter } from './http/router.js';
import { authenticateRequest } from './core/sessions.js';
import { getSchema } from './schema.js';
import { createAuthFnOpenApiDocument } from './openapi.js';
import type {
  AuthFnConfig,
  AuthFnInstance,
  AuthFnSession
} from './types.js';
import { AuthFnConfigError } from './types.js';

export type * from './plugin-types.js';
export type * from './types.js';
export type {
  AuthFnApiKeyRecord,
  AuthFnConfig,
  AuthFnErrorEnvelope,
  AuthFnInstance,
  AuthFnPasswordCredentialRecord,
  AuthFnPlugin,
  AuthFnSchemaDefinition,
  AuthFnSession,
  AuthFnSessionRecord,
  AuthFnSuccessEnvelope,
  AuthFnUserRecord
} from './types.js';
export {
  AuthFnApiKeyRevokedError,
  AuthFnConfigError,
  AuthFnConflictError,
  AuthFnCsrfInvalidError,
  AuthFnEmailNotVerifiedError,
  AuthFnError,
  AuthFnInternalError,
  AuthFnInvalidCredentialsError,
  AuthFnNotFoundError,
  AuthFnNotImplementedError,
  AuthFnOAuthCallbackInvalidError,
  AuthFnOAuthProviderUnsupportedError,
  AuthFnOAuthStateInvalidError,
  AuthFnOAuthStateReplayedError,
  AuthFnPluginAbortedError,
  AuthFnRateLimitedError,
  AuthFnRedirectUriDisallowedError,
  AuthFnRegionMismatchError,
  AuthFnRegionNotFoundError,
  AuthFnSessionExpiredError,
  AuthFnSessionRevokedError,
  AuthFnTwoFactorInvalidCodeError,
  AuthFnTwoFactorRequiredError,
  AuthFnUnauthenticatedError,
  AuthFnValidationError
} from './types.js';
export {
  AUTHFN_SCHEMA_VERSION,
  createCoreTables,
  getSchema
} from './schema.js';
export {
  isBundledPluginDescriptor,
  resolveSchemaPluginInput,
  resolveSchemaPluginInputs
} from './schema-plugin-descriptors.js';
export {
  composePluginHooks,
  composePluginRoutes,
  createPluginRunner,
  createPluginRuntimeContext,
  validatePlugins
} from './plugin-runner.js';
export {
  authenticateApiKey,
  createApiKey,
  listApiKeysForUser,
  revokeApiKeyById,
  sanitizeApiKeyRecord
} from './core/api-keys.js';
export {
  appendTwoFactorMethodToSession,
  beginTwoFactorChallenge,
  confirmTwoFactorEnrollment,
  createPendingTwoFactorResponse,
  createTwoFactorChallenge,
  createTwoFactorEnrollment,
  disableTwoFactorEnrollment,
  getConfirmedTwoFactorEnrollment,
  getTwoFactorPluginConfig,
  hasConfirmedTwoFactorEnrollment,
  satisfyTwoFactorChallenge,
  verifyTwoFactorCode
} from './core/two-factor.js';
export {
  buildLookupResult,
  ensureRegionAlignmentForIdentifier,
  ensureRegionAlignmentForUser,
  findRegionProfileByUserId,
  getMultiRegionPluginConfig,
  lookupRegionByIdentifier,
  registerUserRegion,
  rememberMultiRegionPluginConfig,
  resolveMultiRegionRuntimeOverride,
  resolveRegionForRequest
} from './core/regions.js';
export {
  assertValidCsrf,
  authenticateRequest,
  authenticateSessionToken,
  getCookieSessionState,
  hashSecret,
  issueSession,
  listActiveSessionsForUser,
  requireCookieSession,
  revokeSessionById,
  revokeSessionsForUser
} from './core/sessions.js';
export {
  clearSessionCookies,
  issueSessionCookies,
  readCookieValues,
  resolveCookiePolicy
} from './core/cookies.js';
export {
  mergeRuntimeResolutions,
  resolveRuntime
} from './core/runtime.js';
export { deliverChallenge, emitOtpEvent } from './core/delivery.js';
export {
  createHaveIBeenPwnedPasswordChecker,
  createPasswordCredential,
  getPasswordCredentialByUserId,
  hashPassword,
  signInWithPassword,
  signUpWithPassword,
  updatePasswordCredential,
  verifyPassword
} from './core/passwords.js';
export {
  completeResetPassword,
  getLatestOtpChallenge,
  sendOtpChallenge,
  verifyOtpChallenge
} from './core/verifications.js';
export {
  buildOAuthAccountProfile,
  deleteOAuthAccountByConnectionId,
  findOAuthAccountByConnectionId,
  findOAuthAccountByProviderAccountId,
  findOAuthAccountForUser,
  requireOAuthAccountForUser,
  upsertOAuthAccount
} from './core/oauth-accounts.js';
export { createUser, findUserById, findUserByPrimaryEmail, markUserEmailVerified } from './core/users.js';
export { createAuthFnRouter, createBaseRoutes } from './http/router.js';
export { authFnPasswordPlugin } from './plugins/email-password.js';
export { authFnEmailOtpPlugin } from './plugins/email-otp.js';
export { authFnSocialOAuthPlugin } from './plugins/social-oauth.js';
export { authFnApiKeyPlugin } from './plugins/api-keys.js';
export { authFnTwoFactorPlugin } from './plugins/two-factor.js';
export { authFnMultiRegionPlugin } from './plugins/multi-region.js';
export {
  errorEnvelope,
  jsonError,
  jsonSuccess,
  resolveRequestId,
  successEnvelope
} from './http/envelopes.js';
export { createAuthFnOpenApiDocument } from './openapi.js';
export { emitAuthEvent, eventRequestId } from './core/observability.js';

export function createAuthFn(config: AuthFnConfig): AuthFnInstance {
  if (!Array.isArray(config.plugins)) {
    throw new AuthFnConfigError('authfn plugins must be provided as an array');
  }

  const runner = createPluginRunner(config);
  const router = createAuthFnRouter(config, runner.hooks, runner.routes);

  const provider: AuthProvider<AuthFnSession> = {
    authenticate: async (request) => authenticateRequest(config, request),
    authorize: async () => false,
    revoke: async () => undefined
  };

  const instance: AuthFnInstance = {
    router,
    provider,
    getSchema: () => getSchema(config)
  };

  if (config.openApi) {
    instance.openApi = () => createAuthFnOpenApiDocument(config, router);
  }

  return instance;
}
