import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type {
  AuthFnConfig,
  AuthFnHooks,
  AuthFnHookContext,
  AuthFnPasswordCompromiseCheckResult,
  AuthFnPasswordCompromiseChecker,
  AuthFnPasswordCredentialRecord,
  AuthFnRuntimeResolution,
  AuthFnUserRecord
} from '../types.js';
import {
  AuthFnError,
  AuthFnConflictError,
  AuthFnEmailNotVerifiedError,
  AuthFnInternalError,
  AuthFnInvalidCredentialsError,
  AuthFnPluginAbortedError,
  AuthFnRateLimitedError,
  AuthFnValidationError
} from './errors.js';
import { createUser, findUserByPrimaryEmail } from './users.js';

const PASSWORD_HASH_ALGO = 'scrypt';
const PASSWORD_HASH_N = 16384;
const PASSWORD_HASH_R = 8;
const PASSWORD_HASH_P = 1;
const PASSWORD_HASH_KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 12;

export interface PasswordSignUpInput {
  email: string;
  password: string;
  profile?: Record<string, unknown>;
}

export interface PasswordSignInInput {
  email: string;
  password: string;
}

export interface PasswordSignUpResult {
  user: AuthFnUserRecord;
  credential: AuthFnPasswordCredentialRecord;
}

export interface PasswordSignInResult {
  user: AuthFnUserRecord;
  credential: AuthFnPasswordCredentialRecord;
}

export interface PasswordPolicyOptions {
  compromisedPasswordChecker?: AuthFnPasswordCompromiseChecker;
  requireEmailVerifiedForSignIn?: boolean;
  email?: string;
  purpose?: 'sign-up' | 'reset-password' | 'update-password';
  request?: Request;
  runtime?: AuthFnRuntimeResolution;
}

export interface HaveIBeenPwnedPasswordCheckerOptions {
  fetcher?: typeof fetch;
  minimumExposureCount?: number;
  userAgent?: string;
}

export async function signUpWithPassword(
  config: AuthFnConfig,
  hooks: Partial<AuthFnHooks>,
  input: PasswordSignUpInput,
  context: {
    request?: Request;
    runtime?: AuthFnRuntimeResolution;
    policy?: PasswordPolicyOptions;
  } = {}
): Promise<PasswordSignUpResult> {
  const email = normalizeEmail(input.email);
  assertPasswordLength(input.password);

  const beforeUserInput = await runBeforeUserCreateHook(hooks, {
    config,
    request: context.request,
    runtime: context.runtime
  }, {
    primaryEmail: email,
    metadata: input.profile ?? {}
  });
  const resolvedEmail = normalizeEmail(readString(beforeUserInput.primaryEmail) ?? email);
  const resolvedMetadata = readRecord(beforeUserInput.metadata) ?? input.profile;
  await assertValidPassword(input.password, {
    ...context.policy,
    request: context.request,
    runtime: context.runtime,
    email: resolvedEmail,
    purpose: 'sign-up'
  });

  const existingUser = await findUserByPrimaryEmail(config, resolvedEmail);
  if (existingUser) {
    throw new AuthFnConflictError('A user with this email already exists', {
      primaryEmail: resolvedEmail
    });
  }

  const passwordHash = await hashPassword(input.password);

  return runUserCredentialTransaction(async () => {
    const user = await createUser(config, {
      primaryEmail: resolvedEmail,
      metadata: resolvedMetadata
    });
    let credentialCreated = false;

    try {
      const credential = await createPasswordCredential(config, {
        userId: user.id,
        passwordHash
      });
      credentialCreated = true;
      try {
        await hooks.afterUserCreate?.({
          config,
          request: context.request,
          runtime: context.runtime,
          actorId: user.id
        }, {
          id: user.id,
          primaryEmail: user.primaryEmail,
          metadata: user.metadata ?? {}
        });
      } catch {
        // Fail-open by public hook contract.
      }
      return { user, credential };
    } catch (error) {
      if (!credentialCreated) {
        await config.database.delete({
          model: 'users',
          where: [{ field: 'id', operator: 'eq', value: user.id }],
          namespace: namespace(config)
        });
      }
      throw error;
    }
  });
}

export async function signInWithPassword(
  config: AuthFnConfig,
  input: PasswordSignInInput,
  options: PasswordPolicyOptions = {}
): Promise<PasswordSignInResult> {
  const email = normalizeEmail(input.email);
  assertPasswordInput(email, input.password);

  const user = await findUserByPrimaryEmail(config, email);
  if (!user) {
    throw new AuthFnInvalidCredentialsError('Invalid email or password');
  }

  const credential = await getPasswordCredentialByUserId(config, user.id);
  if (!credential) {
    throw new AuthFnInvalidCredentialsError('Invalid email or password');
  }

  if (options.requireEmailVerifiedForSignIn && !user.emailVerifiedAt) {
    throw new AuthFnEmailNotVerifiedError('Email address must be verified before signing in', {
      userId: user.id,
      primaryEmail: user.primaryEmail
    });
  }

  const valid = await verifyPassword(input.password, credential.passwordHash);
  if (!valid) {
    throw new AuthFnInvalidCredentialsError('Invalid email or password');
  }

  return { user, credential };
}

export async function createPasswordCredential(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  input: { userId: string; passwordHash: string }
): Promise<AuthFnPasswordCredentialRecord> {
  const now = new Date();
  const record: AuthFnPasswordCredentialRecord = {
    id: createIdentifier('pwd'),
    userId: input.userId,
    passwordHash: input.passwordHash,
    createdAt: now,
    updatedAt: now
  };

  return config.database.create<AuthFnPasswordCredentialRecord>({
    model: 'password_credentials',
    data: record,
    namespace: namespace(config)
  });
}

export async function getPasswordCredentialByUserId(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  userId: string
): Promise<AuthFnPasswordCredentialRecord | null> {
  return config.database.findOne<AuthFnPasswordCredentialRecord>({
    model: 'password_credentials',
    where: [{ field: 'userId', operator: 'eq', value: userId }],
    namespace: namespace(config)
  });
}

export async function updatePasswordCredential(
  config: Pick<AuthFnConfig, 'database' | 'namespace'>,
  input: { userId: string; password: string },
  options: PasswordPolicyOptions = {}
): Promise<AuthFnPasswordCredentialRecord> {
  await assertValidPassword(input.password, {
    ...options,
    purpose: options.purpose ?? 'update-password'
  });
  const existing = await getPasswordCredentialByUserId(config, input.userId);
  const passwordHash = await hashPassword(input.password);

  if (!existing) {
    return createPasswordCredential(config, {
      userId: input.userId,
      passwordHash
    });
  }

  const updatedAt = new Date();
  return config.database.update<AuthFnPasswordCredentialRecord>({
    model: 'password_credentials',
    where: [{ field: 'userId', operator: 'eq', value: input.userId }],
    data: {
      passwordHash,
      updatedAt
    },
    namespace: namespace(config)
  });
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordLength(password);
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, PASSWORD_HASH_KEY_LENGTH, {
    N: PASSWORD_HASH_N,
    r: PASSWORD_HASH_R,
    p: PASSWORD_HASH_P
  });

  return [
    PASSWORD_HASH_ALGO,
    String(PASSWORD_HASH_N),
    String(PASSWORD_HASH_R),
    String(PASSWORD_HASH_P),
    salt,
    derived.toString('base64url')
  ].join('$');
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_ALGO) {
    throw new AuthFnInternalError('Stored password hash format is invalid');
  }

  const [, nRaw, rRaw, pRaw, salt, digest] = parts;
  const expected = Buffer.from(digest, 'base64url');
  const derived = scryptSync(password, salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw)
  });

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

function assertPasswordInput(email: string, password: string): void {
  if (!email) {
    throw new AuthFnValidationError('Email is required', {
      field: 'email'
    });
  }

  if (!password) {
    throw new AuthFnValidationError('Password is required', {
      field: 'password'
    });
  }
}

export function createHaveIBeenPwnedPasswordChecker(
  options: HaveIBeenPwnedPasswordCheckerOptions = {}
): AuthFnPasswordCompromiseChecker {
  return async ({ password }) => {
    const fetcher = options.fetcher ?? globalThis.fetch;
    if (typeof fetcher !== 'function') {
      throw new AuthFnInternalError('No fetch implementation is available for compromised-password screening');
    }

    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    const headers = new Headers({
      accept: 'text/plain'
    });
    if (options.userAgent) {
      headers.set('user-agent', options.userAgent);
    }

    const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      headers
    });
    if (response.status === 429) {
      throw new AuthFnRateLimitedError('Compromised-password check is temporarily rate limited', {
        provider: 'haveibeenpwned',
        status: response.status
      });
    }
    if (!response.ok) {
      throw new AuthFnInternalError('Compromised-password check failed', {
        provider: 'haveibeenpwned',
        status: response.status
      });
    }

    const exposures = await response.text();
    const minimumExposureCount = options.minimumExposureCount ?? 1;
    for (const line of exposures.split(/\r?\n/)) {
      const [candidateSuffix, rawCount] = line.trim().split(':', 2);
      if (!candidateSuffix || !rawCount) {
        continue;
      }
      if (candidateSuffix.toUpperCase() !== suffix) {
        continue;
      }

      const count = Number.parseInt(rawCount, 10);
      return {
        compromised: Number.isFinite(count) && count >= minimumExposureCount,
        count: Number.isFinite(count) ? count : undefined
      };
    }

    return false;
  };
}

async function assertValidPassword(
  password: string,
  options: PasswordPolicyOptions = {}
): Promise<void> {
  assertPasswordLength(password);
  const checker = options.compromisedPasswordChecker;
  if (!checker) {
    return;
  }

  const result = await checker({
    password,
    email: options.email,
    purpose: options.purpose ?? 'update-password',
    request: options.request,
    runtime: options.runtime
  });
  const { compromised, count } = readCompromiseCheckResult(result);
  if (compromised) {
    throw new AuthFnValidationError('Password has appeared in known credential breaches', {
      field: 'password',
      exposureCount: count
    });
  }
}

function assertPasswordLength(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthFnValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, {
      field: 'password',
      minLength: MIN_PASSWORD_LENGTH
    });
  }
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

function readCompromiseCheckResult(
  result: AuthFnPasswordCompromiseCheckResult
): { compromised: boolean; count?: number } {
  if (typeof result === 'boolean') {
    return {
      compromised: result
    };
  }

  return {
    compromised: Boolean(result.compromised),
    count: typeof result.count === 'number' ? result.count : undefined
  };
}

async function runUserCredentialTransaction<T>(
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw wrapPasswordError(error);
  }
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
    throw new AuthFnPluginAbortedError('beforeUserCreate hook aborted password sign-up', {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function wrapPasswordError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new AuthFnInternalError('Password operation failed');
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function namespace(config: Pick<AuthFnConfig, 'namespace'>): string {
  return config.namespace ?? 'authfn';
}

function createIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}
