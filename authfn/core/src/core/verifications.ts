import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { NotFoundError } from '@superfunctions/db';
import type {
  AuthFnConfig,
  AuthFnDeliveryProvider,
  AuthFnHookContext,
  AuthFnHooks,
  AuthFnOtpChallengeRecord,
  AuthFnOtpPurpose,
  AuthFnUserRecord
} from '../types.js';
import {
  AuthFnError,
  AuthFnConflictError,
  AuthFnOtpExpiredError,
  AuthFnOtpInvalidError,
  AuthFnOtpReplayedError,
  AuthFnPluginAbortedError,
  AuthFnValidationError
} from './errors.js';
import { emitOtpEvent, deliverChallenge } from './delivery.js';
import { emitAuthEvent, eventRequestId } from './observability.js';
import { hashSecret } from './sessions.js';
import { createUser, findUserByPrimaryEmail, markUserEmailVerified } from './users.js';
import { type PasswordPolicyOptions, updatePasswordCredential } from './passwords.js';
import { resolveRuntime } from './runtime.js';
import {
  allowsOtpSignUpExistingUser,
  emitAccountLinkingConflictEvent
} from './account-linking.js';

const DEFAULT_OTP_TTL_SECONDS = 60 * 10;
const DEFAULT_OTP_MAX_ATTEMPTS = 5;

export interface OtpRuntimeOptions {
  delivery?: AuthFnDeliveryProvider;
  codeGenerator?: () => string;
  now?: () => Date;
  challengeTtlSeconds?: number;
  maxAttempts?: number;
  passwordPolicy?: PasswordPolicyOptions;
}

export interface SendOtpInput {
  request?: Request;
  purpose: AuthFnOtpPurpose;
  email: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyOtpInput {
  request?: Request;
  purpose: AuthFnOtpPurpose;
  email: string;
  code: string;
  profile?: Record<string, unknown>;
}

export interface CompleteResetPasswordInput {
  purpose: 'reset-password';
  email: string;
  code: string;
  newPassword: string;
  request?: Request;
}

export interface SendOtpResult {
  challenge: AuthFnOtpChallengeRecord;
  delivery: { sent: boolean; metadata?: Record<string, unknown> };
}

export interface VerifyOtpResult {
  verified: boolean;
  challenge: AuthFnOtpChallengeRecord;
  user?: AuthFnUserRecord;
  createdUser?: boolean;
  linkedExistingUser?: boolean;
}

export async function sendOtpChallenge(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  runtimeOptions: OtpRuntimeOptions,
  input: SendOtpInput
): Promise<SendOtpResult> {
  const email = normalizeEmail(input.email);
  const now = resolveNow(runtimeOptions);
  const hookContext = await buildChallengeHookContext(config, input.request);
  const challengeInput = await runBeforeChallengeSendHook(hooks, hookContext, {
    purpose: input.purpose,
    email,
    metadata: input.metadata ?? {}
  });

  const challengeCode = resolveCodeGenerator(runtimeOptions)();
  assertValidCode(challengeCode);
  const challenge = await config.database.create<AuthFnOtpChallengeRecord>({
    model: 'otp_challenges',
    data: {
      id: createChallengeId(),
      purpose: readPurpose(challengeInput.purpose, input.purpose),
      email: normalizeEmail(readString(challengeInput.email) ?? email),
      codeHash: hashSecret(challengeCode),
      attemptCount: 0,
      deliveryMetadata: readRecord(challengeInput.metadata),
      expiresAt: new Date(now.getTime() + resolveTtlMs(runtimeOptions)),
      consumedAt: null,
      createdAt: now,
      updatedAt: now
    },
    namespace: namespace(config)
  });

  const delivery = await deliverChallenge(runtimeOptions.delivery, {
    channel: 'email',
    challengeId: challenge.id,
    purpose: challenge.purpose,
    email: challenge.email,
    code: challengeCode,
    metadata: challenge.deliveryMetadata
  });

  const challengeWithDelivery = delivery.metadata
    ? await config.database.update<AuthFnOtpChallengeRecord>({
      model: 'otp_challenges',
      where: [{ field: 'id', operator: 'eq', value: challenge.id }],
      data: {
        deliveryMetadata: {
          ...(challenge.deliveryMetadata ?? {}),
          ...delivery.metadata
        },
        updatedAt: resolveNow(runtimeOptions)
      },
      namespace: namespace(config)
    })
    : challenge;

  try {
    await hooks.afterChallengeSend?.(hookContext, {
      challengeId: challenge.id,
      purpose: challenge.purpose,
      email: challenge.email,
      sent: true,
      deliveryMetadata: challengeWithDelivery.deliveryMetadata ?? {}
    });
  } catch {
    // Fail-open by hook contract.
  }

  await emitOtpEvent(runtimeOptions.delivery, {
    type: 'authfn.otp.sent',
    challengeId: challenge.id,
    purpose: challenge.purpose,
    email: challenge.email,
    outcome: 'sent',
    metadata: {
      deliveryMetadata: challengeWithDelivery.deliveryMetadata ?? {}
    }
  });

  await emitAuthEvent(config, {
    type: 'authfn.otp.sent',
    requestId: eventRequestId(input.request),
    outcome: 'sent',
    metadata: {
      challengeId: challenge.id,
      purpose: challenge.purpose,
      email: challenge.email
    }
  });

  return {
    challenge: challengeWithDelivery,
    delivery: {
      sent: true,
      metadata: challengeWithDelivery.deliveryMetadata
    }
  };
}

export async function verifyOtpChallenge(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  runtimeOptions: OtpRuntimeOptions,
  input: VerifyOtpInput
): Promise<VerifyOtpResult> {
  const email = normalizeEmail(input.email);
  const challenge = await findLatestChallenge(config, input.purpose, email);
  if (!challenge) {
    throw new AuthFnOtpInvalidError('OTP code is invalid', {
      purpose: input.purpose,
      email
    });
  }

  if (challenge.purpose !== input.purpose) {
    throw new AuthFnOtpInvalidError('OTP purpose is invalid', {
      challengeId: challenge.id,
      expectedPurpose: input.purpose,
      actualPurpose: challenge.purpose
    });
  }

  if (challenge.consumedAt) {
    throw new AuthFnOtpReplayedError('OTP code has already been used', {
      challengeId: challenge.id
    });
  }

  const now = resolveNow(runtimeOptions);
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new AuthFnOtpExpiredError('OTP code has expired', {
      challengeId: challenge.id
    });
  }

  const nextAttemptCount = challenge.attemptCount + 1;
  const maxAttempts = runtimeOptions.maxAttempts ?? DEFAULT_OTP_MAX_ATTEMPTS;
  if (nextAttemptCount > maxAttempts) {
    await incrementAttemptCount(config, challenge.id, nextAttemptCount, now);
    throw new AuthFnOtpInvalidError('OTP code is invalid', {
      challengeId: challenge.id,
      attemptCount: nextAttemptCount
    });
  }

  if (!safeCompareHex(challenge.codeHash, hashSecret(input.code))) {
    await incrementAttemptCount(config, challenge.id, nextAttemptCount, now);
    throw new AuthFnOtpInvalidError('OTP code is invalid', {
      challengeId: challenge.id,
      attemptCount: nextAttemptCount
    });
  }

  let createdUser = false;
  let linkedExistingUser = false;
  let user = await findUserByPrimaryEmail(config, email);
  let pendingSignUp: OtpSignUpUserInput | undefined;

  if (input.purpose === 'sign-in') {
    if (!user) {
      throw new AuthFnOtpInvalidError('OTP sign-in requires an existing user', {
        email
      });
    }
  } else if (input.purpose === 'sign-up') {
    pendingSignUp = await resolveOtpSignUpUserInput(config, hooks, input, now);
    user = await findUserByPrimaryEmail(config, pendingSignUp.primaryEmail);
    if (user) {
      if (!allowsOtpSignUpExistingUser(config)) {
        await emitAccountLinkingConflictEvent(config, {
          request: input.request,
          user,
          regionId: pendingSignUp.runtime?.regionId,
          method: 'email-otp',
          reason: 'otp_sign_up_existing_user_disabled'
        });
        throw new AuthFnConflictError('A user with this email already exists', {
          primaryEmail: pendingSignUp.primaryEmail,
          linking: {
            method: 'email-otp',
            reason: 'existing_user'
          }
        });
      }
      linkedExistingUser = true;
    }
  } else if (input.purpose === 'reset-password') {
    if (!user) {
      throw new AuthFnOtpInvalidError('Password reset requires an existing user', {
        email
      });
    }
  }

  const consumed = await consumeOtpChallenge(config, challenge, nextAttemptCount, now);

  if (input.purpose === 'verify-email') {
    if (user) {
      user = await markUserEmailVerified(config, user.id, now);
    }
  } else if (input.purpose === 'sign-up' && linkedExistingUser && user) {
    if (!user.emailVerifiedAt) {
      user = await markUserEmailVerified(config, user.id, now);
    }
  } else if (input.purpose === 'sign-up' && pendingSignUp && !user) {
    user = await createUser(config, {
      primaryEmail: pendingSignUp.primaryEmail,
      emailVerifiedAt: now,
      metadata: pendingSignUp.metadata
    });
    createdUser = true;
    try {
      await hooks.afterUserCreate?.(
        {
          config,
          request: input.request,
          runtime: pendingSignUp.runtime,
          actorId: user.id
        },
        {
          id: user.id,
          primaryEmail: user.primaryEmail,
          metadata: user.metadata ?? {}
        }
      );
    } catch (afterHookError) {
      if (afterHookError instanceof AuthFnError) {
        await rollbackOtpSignUpUser(config, user.id);
        throw afterHookError;
      }
      // Fail-open by public hook contract.
    }
  }

  await emitOtpEvent(runtimeOptions.delivery, {
    type: 'authfn.otp.verified',
    challengeId: challenge.id,
    purpose: challenge.purpose,
    email: challenge.email,
    outcome: 'verified'
  });

  await emitAuthEvent(config, {
    type: 'authfn.otp.verified',
    requestId: eventRequestId(input.request),
    actorId: user?.id,
    userId: user?.id,
    outcome: 'verified',
    metadata: {
      challengeId: challenge.id,
      purpose: challenge.purpose,
      email: challenge.email
    }
  });

  return {
    verified: true,
    challenge: consumed,
    user: user ?? undefined,
    createdUser,
    linkedExistingUser
  };
}

async function consumeOtpChallenge(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  challenge: AuthFnOtpChallengeRecord,
  attemptCount: number,
  consumedAt: Date
): Promise<AuthFnOtpChallengeRecord> {
  try {
    return await config.database.update<AuthFnOtpChallengeRecord>({
      model: 'otp_challenges',
      where: [
        { field: 'id', operator: 'eq', value: challenge.id },
        { field: 'consumedAt', operator: 'eq', value: null }
      ],
      data: {
        attemptCount,
        consumedAt,
        updatedAt: consumedAt
      },
      namespace: namespace(config)
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new AuthFnOtpReplayedError('OTP code has already been used', {
        challengeId: challenge.id
      });
    }
    throw error;
  }
}

export async function completeResetPassword(
  config: AuthFnConfig,
  runtimeOptions: OtpRuntimeOptions,
  input: CompleteResetPasswordInput
): Promise<{ passwordUpdated: true }> {
  const email = normalizeEmail(input.email);
  const runtime = input.request ? await resolveRuntime(config, input.request) : undefined;
  const challenge = await verifyOtpChallenge(config, {}, runtimeOptions, {
    request: input.request,
    purpose: input.purpose,
    email,
    code: input.code
  });

  const user = challenge.user ?? await findUserByPrimaryEmail(config, email);
  if (!user) {
    throw new AuthFnOtpInvalidError('Password reset requires an existing user', {
      email
    });
  }

  await updatePasswordCredential(config, {
    userId: user.id,
    password: input.newPassword
  }, {
    ...runtimeOptions.passwordPolicy,
    request: input.request,
    runtime,
    email,
    purpose: 'reset-password'
  });

  return {
    passwordUpdated: true
  };
}

export async function getLatestOtpChallenge(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  purpose: AuthFnOtpPurpose,
  email: string
): Promise<AuthFnOtpChallengeRecord | null> {
  return findLatestChallenge(config, purpose, email);
}

async function findLatestChallenge(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  purpose: AuthFnOtpPurpose,
  email: string
): Promise<AuthFnOtpChallengeRecord | null> {
  const rows = await config.database.findMany<AuthFnOtpChallengeRecord>({
    model: 'otp_challenges',
    where: [
      { field: 'purpose', operator: 'eq', value: purpose },
      { field: 'email', operator: 'eq', value: email }
    ],
    orderBy: [
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'desc' }
    ],
    namespace: namespace(config)
  });

  return rows[0] ?? null;
}

async function incrementAttemptCount(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  challengeId: string,
  attemptCount: number,
  updatedAt: Date
): Promise<void> {
  await config.database.update({
    model: 'otp_challenges',
    where: [{ field: 'id', operator: 'eq', value: challengeId }],
    data: {
      attemptCount,
      updatedAt
    },
    namespace: namespace(config)
  });
}

async function runBeforeChallengeSendHook(
  hooks: Partial<AuthFnHooks>,
  ctx: AuthFnHookContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!hooks.beforeChallengeSend) {
    return input;
  }

  try {
    const transformed = await hooks.beforeChallengeSend(ctx, input);
    return transformed ?? input;
  } catch (error) {
    if (error instanceof AuthFnError) {
      throw error;
    }
    throw new AuthFnPluginAbortedError('beforeChallengeSend hook aborted OTP send', {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function createChallengeId(): string {
  return `otp_${randomBytes(8).toString('hex')}`;
}

function resolveCodeGenerator(options: OtpRuntimeOptions): () => string {
  return options.codeGenerator ?? (() => String(randomInt(100000, 1000000)));
}

function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveNow(options: OtpRuntimeOptions): Date {
  return options.now?.() ?? new Date();
}

function resolveTtlMs(options: OtpRuntimeOptions): number {
  return (options.challengeTtlSeconds ?? DEFAULT_OTP_TTL_SECONDS) * 1000;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new AuthFnValidationError('A valid email is required', {
      field: 'email'
    });
  }
  return normalized;
}

function assertValidCode(code: string): void {
  if (!/^\d{6}$/.test(code)) {
    throw new AuthFnValidationError('OTP code generator must produce a 6 digit string');
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readPurpose(value: unknown, fallback: AuthFnOtpPurpose): AuthFnOtpPurpose {
  if (
    value === 'verify-email'
    || value === 'sign-in'
    || value === 'sign-up'
    || value === 'reset-password'
  ) {
    return value;
  }
  return fallback;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

async function rollbackOtpSignUpUser(
  config: Pick<AuthFnConfig, 'database' | 'namespace' | 'observability'>,
  userId: string
): Promise<void> {
  const failures: string[] = [];
  await config.database.deleteMany({
    model: 'region_profiles',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  }).catch((error) => failures.push(readRollbackFailure('region_profiles.deleteMany', error)));

  await config.database.delete({
    model: 'users',
    where: [{ field: 'id', operator: 'eq', value: userId }],
    namespace: namespace(config)
  }).catch((error) => failures.push(readRollbackFailure('users.delete', error)));

  if (failures.length > 0) {
    await emitAuthEvent(config, {
      type: 'authfn.otp.signup.rollback_failed',
      requestId: eventRequestId(),
      actorId: userId,
      userId,
      outcome: 'error',
      metadata: {
        failures
      }
    });
  }
}

function readRollbackFailure(operation: string, error: unknown): string {
  const reason = error instanceof Error ? error.name : 'UnknownError';
  return `${operation}: ${reason}`;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof NotFoundError
    || Boolean(
      error
        && typeof error === 'object'
        && (error as { name?: unknown }).name === 'NotFoundError'
    );
}

async function buildChallengeHookContext(
  config: AuthFnConfig,
  request?: Request
): Promise<AuthFnHookContext> {
  return {
    config,
    request,
    runtime: request ? await resolveRuntime(config, request) : undefined
  };
}

interface OtpSignUpUserInput {
  primaryEmail: string;
  metadata?: Record<string, unknown>;
  runtime?: Awaited<ReturnType<typeof resolveRuntime>>;
}

async function resolveOtpSignUpUserInput(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  input: VerifyOtpInput,
  verifiedAt: Date
): Promise<OtpSignUpUserInput> {
  const hookContext = await buildChallengeHookContext(config, input.request);
  const beforeUserInput = await runBeforeUserCreateHook(hooks, hookContext, {
    primaryEmail: normalizeEmail(input.email),
    emailVerifiedAt: verifiedAt,
    metadata: input.profile ?? {}
  });

  return {
    primaryEmail: normalizeEmail(readString(beforeUserInput.primaryEmail) ?? input.email),
    metadata: readRecord(beforeUserInput.metadata) ?? input.profile,
    runtime: hookContext.runtime
  };
}

async function runBeforeUserCreateHook(
  hooks: Partial<AuthFnHooks>,
  ctx: AuthFnHookContext,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!hooks.beforeUserCreate) {
    return input;
  }

  try {
    const transformed = await hooks.beforeUserCreate(ctx, input);
    return transformed ?? input;
  } catch (error) {
    if (error instanceof AuthFnError) {
      throw error;
    }
    throw new AuthFnPluginAbortedError('beforeUserCreate hook aborted OTP sign-up', {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}
