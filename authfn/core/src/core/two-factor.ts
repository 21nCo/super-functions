import {
  NotFoundError,
} from '@superfunctions/db';
import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import { AesGcmTokenCipher } from '@superfunctions/oauth-storage';
import type {
  AuthFnAuthMethod,
  AuthFnConfig,
  AuthFnSession,
  AuthFnTwoFactorChallengeRecord,
  AuthFnTwoFactorEnrollmentRecord,
  AuthFnTwoFactorRecoveryCodeRecord,
  AuthFnUserRecord
} from '../types.js';
import type { TwoFactorPluginConfig } from '../plugin-types.js';
import {
  AuthFnConfigError,
  AuthFnConflictError,
  AuthFnNotFoundError,
  AuthFnTwoFactorInvalidCodeError,
  AuthFnTwoFactorRequiredError
} from './errors.js';
import { hashSecret } from './sessions.js';
import { findUserById } from './users.js';

const DEFAULT_ISSUER = 'authfn';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_WINDOW = 1;
const DEFAULT_RECOVERY_CODE_COUNT = 10;
const DEFAULT_CHALLENGE_TTL_SECONDS = 300;
const DEFAULT_ENCRYPTION_KEY_REF = 'authfn-2fa';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const twoFactorPluginConfigs = new WeakMap<object, TwoFactorPluginConfig>();

export interface CreatedTwoFactorEnrollment {
  enrollment: AuthFnTwoFactorEnrollmentRecord;
  secret: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

export interface CreatedTwoFactorChallenge {
  challenge: AuthFnTwoFactorChallengeRecord;
  user: AuthFnUserRecord;
}

export interface SatisfiedTwoFactorChallenge {
  challenge: AuthFnTwoFactorChallengeRecord;
  user: AuthFnUserRecord;
  methods: AuthFnAuthMethod[];
  usedRecoveryCode: boolean;
}

export function rememberTwoFactorPluginConfig(
  plugin: object,
  config: TwoFactorPluginConfig
): void {
  twoFactorPluginConfigs.set(plugin, config);
}

export function getTwoFactorPluginConfig(
  config: Pick<AuthFnConfig, 'plugins'>
): TwoFactorPluginConfig | null {
  for (const plugin of config.plugins) {
    if (plugin.name !== 'twoFactor') {
      continue;
    }

    return twoFactorPluginConfigs.get(plugin) ?? {};
  }

  return null;
}

export async function getConfirmedTwoFactorEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnTwoFactorEnrollmentRecord | null> {
  const enrollment = await config.database.findOne<AuthFnTwoFactorEnrollmentRecord>({
    model: 'two_factor_enrollments',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });

  return enrollment?.confirmedAt ? enrollment : null;
}

export async function hasConfirmedTwoFactorEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<boolean> {
  const enrollment = await config.database.findOne<AuthFnTwoFactorEnrollmentRecord>({
    model: 'two_factor_enrollments',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });

  return Boolean(enrollment?.confirmedAt);
}

export async function createTwoFactorEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  user: Pick<AuthFnUserRecord, 'id' | 'primaryEmail'>,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<CreatedTwoFactorEnrollment> {
  const existing = await config.database.findOne<AuthFnTwoFactorEnrollmentRecord>({
    model: 'two_factor_enrollments',
    where: [{ field: 'userId', operator: 'eq', value: user.id }],
    namespace: namespace(config)
  });

  if (existing?.confirmedAt) {
    throw new AuthFnConflictError('Two-factor authentication is already enabled', {
      userId: user.id
    });
  }

  const now = resolveNow(pluginConfig);
  const secret = generateBase32Secret();
  const encryptedSecret = await encryptSecret(config, pluginConfig, secret);
  const recoveryCodes = generateRecoveryCodes(pluginConfig.recoveryCodeCount ?? DEFAULT_RECOVERY_CODE_COUNT);
  const enrollment: AuthFnTwoFactorEnrollmentRecord = {
    id: existing?.id ?? createIdentifier('tfa'),
    userId: user.id,
    secretEncrypted: encryptedSecret,
    lastUsedCounter: null,
    confirmedAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  if (existing) {
    await config.database.update<AuthFnTwoFactorEnrollmentRecord>({
      model: 'two_factor_enrollments',
      where: [{ field: 'id', operator: 'eq', value: existing.id }],
      data: {
        secretEncrypted: encryptedSecret,
        lastUsedCounter: null,
        confirmedAt: null,
        updatedAt: now
      },
      namespace: namespace(config)
    });
    await config.database.deleteMany({
      model: 'two_factor_recovery_codes',
      where: [{ field: 'enrollmentId', operator: 'eq', value: existing.id }],
      namespace: namespace(config)
    });
  } else {
    await config.database.create<AuthFnTwoFactorEnrollmentRecord>({
      model: 'two_factor_enrollments',
      data: enrollment,
      namespace: namespace(config)
    });
  }

  for (const recoveryCode of recoveryCodes) {
    await config.database.create<AuthFnTwoFactorRecoveryCodeRecord>({
      model: 'two_factor_recovery_codes',
      data: {
        id: createIdentifier('recovery'),
        enrollmentId: enrollment.id,
        codeHash: hashSecret(normalizeTwoFactorCode(recoveryCode)),
        usedAt: null,
        createdAt: now
      },
      namespace: namespace(config)
    });
  }

  return {
    enrollment,
    secret,
    otpauthUri: buildOtpAuthUri(pluginConfig, user, secret),
    recoveryCodes
  };
}

export async function confirmTwoFactorEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string,
  code: string,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<AuthFnTwoFactorEnrollmentRecord> {
  const enrollment = await requireTwoFactorEnrollment(config, userId);
  if (enrollment.confirmedAt) {
    return enrollment;
  }

  await verifyTwoFactorTotp(config, enrollment, code, pluginConfig);
  const now = resolveNow(pluginConfig);
  return config.database.update<AuthFnTwoFactorEnrollmentRecord>({
    model: 'two_factor_enrollments',
    where: [{ field: 'id', operator: 'eq', value: enrollment.id }],
    data: {
      confirmedAt: now,
      updatedAt: now
    },
    namespace: namespace(config)
  });
}

export async function createTwoFactorChallenge(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  user: AuthFnUserRecord,
  primaryMethod: Exclude<AuthFnAuthMethod, 'two-factor' | 'api-key'>,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<CreatedTwoFactorChallenge | null> {
  const enrollment = await requireConfirmedEnrollment(config, user.id);
  if (!enrollment) {
    return null;
  }

  const now = resolveNow(pluginConfig);
  const challenge: AuthFnTwoFactorChallengeRecord = {
    id: createIdentifier('signin_2fa'),
    userId: user.id,
    primaryMethod,
    expiresAt: new Date(now.getTime() + ((pluginConfig.challengeTtlSeconds ?? DEFAULT_CHALLENGE_TTL_SECONDS) * 1000)),
    consumedAt: null,
    createdAt: now,
    updatedAt: now
  };

  await config.database.create<AuthFnTwoFactorChallengeRecord>({
    model: 'two_factor_challenges',
    data: challenge,
    namespace: namespace(config)
  });

  return {
    challenge,
    user
  };
}

export async function beginTwoFactorChallenge(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  user: AuthFnUserRecord,
  primaryMethod: Exclude<AuthFnAuthMethod, 'two-factor' | 'api-key'>,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<CreatedTwoFactorChallenge | null> {
  return createTwoFactorChallenge(config, user, primaryMethod, pluginConfig);
}

export async function satisfyTwoFactorChallenge(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  challengeId: string,
  code: string,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<SatisfiedTwoFactorChallenge> {
  const challenge = await config.database.findOne<AuthFnTwoFactorChallengeRecord>({
    model: 'two_factor_challenges',
    where: [{ field: 'id', operator: 'eq', value: challengeId }],
    namespace: namespace(config)
  });
  if (!challenge) {
    throw new AuthFnNotFoundError('Two-factor challenge not found', { challengeId });
  }

  const now = resolveNow(pluginConfig);
  if (challenge.consumedAt || challenge.expiresAt.getTime() <= now.getTime()) {
    throw new AuthFnTwoFactorInvalidCodeError('Two-factor challenge is invalid or expired', {
      challengeId
    });
  }

  const user = await findUserById(config as AuthFnConfig, challenge.userId);
  if (!user) {
    throw new AuthFnNotFoundError('User not found for two-factor challenge', {
      challengeId,
      userId: challenge.userId
    });
  }

  const enrollment = await requireConfirmedEnrollment(config, challenge.userId);
  if (!enrollment) {
    throw new AuthFnNotFoundError('Two-factor enrollment not found', {
      challengeId,
      userId: challenge.userId
    });
  }

  const usedRecoveryCode = await tryConsumeRecoveryCode(config, enrollment.id, code, now);
  if (!usedRecoveryCode) {
    await verifyTwoFactorTotp(config, enrollment, code, pluginConfig);
  }

  const consumed = await config.database.update<AuthFnTwoFactorChallengeRecord>({
    model: 'two_factor_challenges',
    where: [{ field: 'id', operator: 'eq', value: challenge.id }],
    data: {
      consumedAt: now,
      updatedAt: now
    },
    namespace: namespace(config)
  });

  return {
    challenge: consumed,
    user,
    methods: [challenge.primaryMethod, 'two-factor'] as AuthFnAuthMethod[],
    usedRecoveryCode
  };
}

export async function disableTwoFactorEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string,
  code: string,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<void> {
  const enrollment = await requireConfirmedEnrollment(config, userId);
  if (!enrollment) {
    throw new AuthFnNotFoundError('Two-factor enrollment not found', { userId });
  }

  const now = resolveNow(pluginConfig);
  const usedRecoveryCode = await tryConsumeRecoveryCode(config, enrollment.id, code, now);
  if (!usedRecoveryCode) {
    await verifyTwoFactorTotp(config, enrollment, code, pluginConfig);
  }

  await config.database.delete({
    model: 'two_factor_enrollments',
    where: [{ field: 'id', operator: 'eq', value: enrollment.id }],
    namespace: namespace(config)
  });
  await config.database.deleteMany({
    model: 'two_factor_recovery_codes',
    where: [{ field: 'enrollmentId', operator: 'eq', value: enrollment.id }],
    namespace: namespace(config)
  });
  await config.database.deleteMany({
    model: 'two_factor_challenges',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
}

export async function verifyTwoFactorCode(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string,
  code: string,
  pluginConfig: TwoFactorPluginConfig = {}
): Promise<{ usedRecoveryCode: boolean }> {
  const enrollment = await requireConfirmedEnrollment(config, userId);
  if (!enrollment) {
    throw new AuthFnNotFoundError('Two-factor enrollment not found', { userId });
  }

  const now = resolveNow(pluginConfig);
  const usedRecoveryCode = await tryConsumeRecoveryCode(config, enrollment.id, code, now);
  if (!usedRecoveryCode) {
    await verifyTwoFactorTotp(config, enrollment, code, pluginConfig);
  }

  return { usedRecoveryCode };
}

export async function appendTwoFactorMethodToSession(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  sessionId: string
): Promise<AuthFnSession['methods']> {
  const record = await config.database.findOne<{ methods: AuthFnAuthMethod[]; id: string }>({
    model: 'sessions',
    where: [{ field: 'id', operator: 'eq', value: sessionId }],
    namespace: namespace(config)
  });
  if (!record) {
    throw new AuthFnNotFoundError('Session not found', { sessionId });
  }

  const nextMethods: AuthFnAuthMethod[] = record.methods.includes('two-factor')
    ? record.methods
    : [...record.methods, 'two-factor'];

  await config.database.update({
    model: 'sessions',
    where: [{ field: 'id', operator: 'eq', value: sessionId }],
    data: {
      methods: nextMethods,
      updatedAt: new Date()
    },
    namespace: namespace(config)
  });

  return nextMethods;
}

export function createPendingTwoFactorResponse(
  challenge: Pick<AuthFnTwoFactorChallengeRecord, 'id' | 'primaryMethod' | 'expiresAt'>
): AuthFnTwoFactorRequiredError {
  return new AuthFnTwoFactorRequiredError('Two-factor authentication required', {
    challengeId: challenge.id,
    primaryMethod: challenge.primaryMethod,
    expiresAt: challenge.expiresAt.toISOString(),
    availableMethods: ['totp', 'recovery-code']
  });
}

async function requireTwoFactorEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnTwoFactorEnrollmentRecord> {
  const enrollment = await config.database.findOne<AuthFnTwoFactorEnrollmentRecord>({
    model: 'two_factor_enrollments',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
  if (!enrollment) {
    throw new AuthFnNotFoundError('Two-factor enrollment not found', { userId });
  }

  return enrollment;
}

async function requireConfirmedEnrollment(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnTwoFactorEnrollmentRecord | null> {
  const enrollment = await config.database.findOne<AuthFnTwoFactorEnrollmentRecord>({
    model: 'two_factor_enrollments',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
  if (!enrollment?.confirmedAt) {
    return null;
  }

  return enrollment;
}

async function tryConsumeRecoveryCode(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  enrollmentId: string,
  code: string,
  now: Date
): Promise<boolean> {
  const recoveryCodes = await config.database.findMany<AuthFnTwoFactorRecoveryCodeRecord>({
    model: 'two_factor_recovery_codes',
    where: [{ field: 'enrollmentId', operator: 'eq', value: enrollmentId }],
    namespace: namespace(config)
  });
  const normalized = normalizeTwoFactorCode(code);
  const matched = recoveryCodes.find((entry) =>
    !entry.usedAt && safeCompareHex(entry.codeHash, hashSecret(normalized))
  );
  if (!matched) {
    return false;
  }

  await config.database.update<AuthFnTwoFactorRecoveryCodeRecord>({
    model: 'two_factor_recovery_codes',
    where: [{ field: 'id', operator: 'eq', value: matched.id }],
    data: {
      usedAt: now
    },
    namespace: namespace(config)
  });
  return true;
}

async function verifyTwoFactorTotp(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  enrollment: AuthFnTwoFactorEnrollmentRecord,
  code: string,
  pluginConfig: TwoFactorPluginConfig
): Promise<void> {
  const now = resolveNow(pluginConfig);
  const secret = await decryptSecret(config, pluginConfig, enrollment.secretEncrypted);
  const normalizedCode = normalizeTwoFactorCode(code);
  let currentEnrollment: AuthFnTwoFactorEnrollmentRecord = enrollment;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const matchedCounter = verifyTotpCode(
      secret,
      normalizedCode,
      pluginConfig,
      now,
      currentEnrollment.lastUsedCounter ?? null
    );
    if (matchedCounter === null) {
      break;
    }

    try {
      const affected = await config.database.updateMany({
        model: 'two_factor_enrollments',
        where: [
          { field: 'id', operator: 'eq', value: currentEnrollment.id },
          {
            field: 'lastUsedCounter',
            operator: 'eq',
            value: currentEnrollment.lastUsedCounter ?? null,
            connector: 'AND'
          }
        ],
        data: {
          lastUsedCounter: matchedCounter,
          updatedAt: now
        },
        namespace: namespace(config)
      });
      if (affected === 0) {
        throw new NotFoundError('two_factor_enrollments', [
          { field: 'id', operator: 'eq', value: currentEnrollment.id },
          {
            field: 'lastUsedCounter',
            operator: 'eq',
            value: currentEnrollment.lastUsedCounter ?? null,
            connector: 'AND'
          }
        ]);
      }
      return;
    } catch (error) {
      if (!(error instanceof NotFoundError)) {
        throw error;
      }

      currentEnrollment = await requireTwoFactorEnrollment(config, enrollment.userId);
    }
  }

  throw new AuthFnTwoFactorInvalidCodeError('Two-factor authentication code is invalid', {
    userId: enrollment.userId
  });
}

async function encryptSecret(
  config: Pick<AuthFnConfig, 'namespace'>,
  pluginConfig: TwoFactorPluginConfig,
  secret: string
): Promise<string> {
  const cipher = createSecretCipher(config, pluginConfig);
  return cipher.encrypt(secret, pluginConfig.encryptionKeyRef ?? DEFAULT_ENCRYPTION_KEY_REF);
}

async function decryptSecret(
  config: Pick<AuthFnConfig, 'namespace'>,
  pluginConfig: TwoFactorPluginConfig,
  encrypted: string
): Promise<string> {
  const cipher = createSecretCipher(config, pluginConfig);
  return cipher.decrypt(encrypted, pluginConfig.encryptionKeyRef ?? DEFAULT_ENCRYPTION_KEY_REF);
}

function createSecretCipher(
  config: Pick<AuthFnConfig, 'namespace'>,
  pluginConfig: TwoFactorPluginConfig
): AesGcmTokenCipher {
  const resolver = pluginConfig.encryptionKeyResolver;
  if (!resolver) {
    throw new AuthFnConfigError('Two-factor encryptionKeyResolver must be configured', {
      keyRef: pluginConfig.encryptionKeyRef ?? DEFAULT_ENCRYPTION_KEY_REF,
      namespace: namespace(config)
    });
  }

  return new AesGcmTokenCipher(async (keyRef) => {
    const resolved = await resolver(keyRef);
    if (resolved) {
      return resolved;
    }

    throw new AuthFnConfigError('Two-factor encryptionKeyResolver must be configured', {
      keyRef,
      namespace: namespace(config)
    });
  });
}

function buildOtpAuthUri(
  pluginConfig: TwoFactorPluginConfig,
  user: Pick<AuthFnUserRecord, 'id' | 'primaryEmail'>,
  secret: string
): string {
  const issuer = encodeURIComponent(pluginConfig.issuer ?? DEFAULT_ISSUER);
  const label = encodeURIComponent(user.primaryEmail ?? user.id);
  const digits = pluginConfig.digits ?? DEFAULT_DIGITS;
  const period = pluginConfig.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  return `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&digits=${digits}&period=${period}`;
}

function generateBase32Secret(): string {
  const bytes = randomBytes(20);
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }

  return output;
}

function generateRecoveryCodes(count: number): string[] {
  return Array.from({ length: count }, () => {
    const value = randomBytes(5).toString('hex').toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5, 10)}`;
  });
}

function verifyTotpCode(
  secret: string,
  code: string,
  pluginConfig: TwoFactorPluginConfig,
  now: Date,
  lastUsedCounter: number | null
): number | null {
  const digits = pluginConfig.digits ?? DEFAULT_DIGITS;
  const periodSeconds = pluginConfig.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  const window = pluginConfig.window ?? DEFAULT_WINDOW;
  const counter = Math.floor(now.getTime() / 1000 / periodSeconds);
  const key = decodeBase32(secret);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidateCounter = counter + offset;
    if (lastUsedCounter !== null && candidateCounter <= lastUsedCounter) {
      continue;
    }

    const generated = generateTotp(key, candidateCounter, digits);
    if (safeCompareString(generated, code)) {
      return candidateCounter;
    }
  }

  return null;
}

function generateTotp(key: Buffer, counter: number, digits: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  const token = String(binary % (10 ** digits));
  return token.padStart(digits, '0');
}

function decodeBase32(secret: string): Buffer {
  const normalized = secret.replace(/=+$/g, '').toUpperCase();
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      continue;
    }

    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function normalizeTwoFactorCode(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

function safeCompareString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function safeCompareHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveNow(pluginConfig: TwoFactorPluginConfig): Date {
  return pluginConfig.now?.() ?? new Date();
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}
