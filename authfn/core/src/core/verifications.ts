import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
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
  AuthFnOtpExpiredError,
  AuthFnOtpInvalidError,
  AuthFnOtpReplayedError,
  AuthFnPluginAbortedError,
  AuthFnValidationError
} from './errors.js';
import { emitOtpEvent, deliverChallenge } from './delivery.js';
import { emitAuthEvent, eventRequestId } from './observability.js';
import { hashSecret } from './sessions.js';
import { findUserByPrimaryEmail, markUserEmailVerified } from './users.js';
import { type PasswordPolicyOptions, updatePasswordCredential } from './passwords.js';
import { resolveRuntime } from './runtime.js';

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

  const consumed = await config.database.update<AuthFnOtpChallengeRecord>({
    model: 'otp_challenges',
    where: [{ field: 'id', operator: 'eq', value: challenge.id }],
    data: {
      attemptCount: nextAttemptCount,
      consumedAt: now,
      updatedAt: now
    },
    namespace: namespace(config)
  });

  let user = await findUserByPrimaryEmail(config, email);

  if (input.purpose === 'verify-email') {
    if (user) {
      user = await markUserEmailVerified(config, user.id, now);
    }
  } else if (input.purpose === 'sign-in') {
    if (!user) {
      throw new AuthFnOtpInvalidError('OTP sign-in requires an existing user', {
        email
      });
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
    user: user ?? undefined
  };
}

export async function completeResetPassword(
  config: AuthFnConfig,
  runtimeOptions: OtpRuntimeOptions,
  input: CompleteResetPasswordInput
): Promise<{ passwordUpdated: true }> {
  const email = normalizeEmail(input.email);
  const runtime = input.request ? await resolveRuntime(config, input.request) : undefined;
  const challenge = await verifyOtpChallenge(config, runtimeOptions, {
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
  if (value === 'verify-email' || value === 'sign-in' || value === 'reset-password') {
    return value;
  }
  return fallback;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
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
