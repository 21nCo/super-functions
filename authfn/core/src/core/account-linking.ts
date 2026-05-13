import type {
  AuthFnConfig,
  AuthFnSocialProviderId,
  AuthFnUserRecord
} from '../types.js';
import { emitAuthEvent, eventRequestId } from './observability.js';

export function allowsOAuthLinkByVerifiedEmail(
  config: Pick<AuthFnConfig, 'accountLinking'>,
  providerId: AuthFnSocialProviderId
): {
  allowed: boolean;
  requireExistingEmailVerified: boolean;
  requireProviderEmailVerified: boolean;
} {
  const policy = config.accountLinking?.oauthByVerifiedEmail;
  if (!policy) {
    return {
      allowed: false,
      requireExistingEmailVerified: true,
      requireProviderEmailVerified: true
    };
  }

  if (policy === true) {
    return {
      allowed: true,
      requireExistingEmailVerified: true,
      requireProviderEmailVerified: true
    };
  }

  const providers = policy.providers;
  return {
    allowed: !providers?.length || providers.includes(providerId),
    requireExistingEmailVerified: policy.requireExistingEmailVerified ?? true,
    requireProviderEmailVerified: policy.requireProviderEmailVerified ?? true
  };
}

export function allowsOtpSignUpExistingUser(
  config: Pick<AuthFnConfig, 'accountLinking'>
): boolean {
  return config.accountLinking?.otpSignUpExistingUser ?? false;
}

export function allowsPasswordForAuthenticatedUser(
  config: Pick<AuthFnConfig, 'accountLinking'>
): {
  allowed: boolean;
  requireExistingEmailVerified: boolean;
} {
  const policy = config.accountLinking?.passwordForAuthenticatedUser;
  if (!policy) {
    return {
      allowed: false,
      requireExistingEmailVerified: true
    };
  }

  if (policy === true) {
    return {
      allowed: true,
      requireExistingEmailVerified: true
    };
  }

  return {
    allowed: true,
    requireExistingEmailVerified: policy.requireExistingEmailVerified ?? true
  };
}

export async function emitAccountLinkedEvent(
  config: Pick<AuthFnConfig, 'observability'>,
  input: {
    request?: Request;
    user: AuthFnUserRecord;
    method: string;
    provider?: AuthFnSocialProviderId;
    regionId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await emitAuthEvent(config, {
    type: 'authfn.account_linked',
    requestId: eventRequestId(input.request),
    actorId: input.user.id,
    userId: input.user.id,
    regionId: input.regionId,
    provider: input.provider,
    outcome: 'linked',
    metadata: {
      ...(input.metadata ?? {}),
      method: input.method,
      primaryEmail: input.user.primaryEmail
    }
  });
}

export async function emitAccountLinkingConflictEvent(
  config: Pick<AuthFnConfig, 'observability'>,
  input: {
    request?: Request;
    user?: AuthFnUserRecord;
    primaryEmail?: string;
    method: string;
    provider?: AuthFnSocialProviderId;
    regionId?: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await emitAuthEvent(config, {
    type: 'authfn.account_linking.conflict',
    requestId: eventRequestId(input.request),
    actorId: input.user?.id,
    userId: input.user?.id,
    regionId: input.regionId,
    provider: input.provider,
    outcome: 'conflict',
    metadata: {
      method: input.method,
      primaryEmail: input.primaryEmail ?? input.user?.primaryEmail,
      reason: input.reason,
      ...(input.metadata ?? {})
    }
  });
}
