import type { OAuthTokenHttpClient } from '@superfunctions/oauth-http';
import type { OAuthStateStore } from '@superfunctions/oauth-storage';
import type { OAuth2Config, OAuth2RuntimeConfig, TokenResponse } from '../types/provider.js';
import type { OAuthState } from './types.js';
import {
  createLegacyOAuthFlowDelegate,
  type LegacyOAuthFlowDelegate,
} from './oauth-flow-legacy-delegate.js';

const LEGACY_PATH_WARNING_CODE = 'DEPRECATED_PATH' as const;
const LEGACY_PATH_WARNING_MESSAGE =
  '[DEPRECATED_PATH] plugfn/auth/oauth-flow is deprecated and will be removed in plugfn@0.2.0. ' +
  'Use @superfunctions/oauth-flow (+ @superfunctions/oauth-http/@superfunctions/oauth-storage) instead.';
let warnedLegacyPath = false;

function warnLegacyPath(): void {
  if (warnedLegacyPath) {
    return;
  }
  warnedLegacyPath = true;
  process.emitWarning(LEGACY_PATH_WARNING_MESSAGE, LEGACY_PATH_WARNING_CODE);
}

warnLegacyPath();

export class OAuthFlowHandler {
  private readonly delegate: LegacyOAuthFlowDelegate;

  constructor(
    firstArg?: OAuthStateStore | LegacyOAuthFlowDelegate,
    stateTimeout = 600000,
    tokenClient?: OAuthTokenHttpClient
  ) {
    this.delegate = isLegacyOAuthFlowDelegate(firstArg)
      ? firstArg
      : createLegacyOAuthFlowDelegate({
          stateStore: firstArg,
          stateTimeout,
          tokenClient,
        });
  }

  async getAuthorizationUrl(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig
  ): Promise<{ url: string; state: string }> {
    return this.delegate.getAuthorizationUrl(config, runtimeConfig);
  }

  async exchangeCodeForToken(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig,
    code: string
  ): Promise<TokenResponse> {
    return this.delegate.exchangeCodeForToken(config, runtimeConfig, code);
  }

  async refreshAccessToken(
    config: OAuth2Config,
    runtimeConfig: OAuth2RuntimeConfig,
    renewalCredential: string
  ): Promise<TokenResponse> {
    return this.delegate.refreshAccessToken(config, runtimeConfig, renewalCredential);
  }

  async verifyState(state: string): Promise<OAuthState | null> {
    return this.delegate.verifyState(state);
  }
}

export function getLegacyOAuthFlowDeprecationNotice(): {
  code: 'DEPRECATED_PATH';
  message: string;
  replacement: '@superfunctions/oauth-flow';
  removalTarget: 'plugfn@0.2.0';
} {
  return {
    code: LEGACY_PATH_WARNING_CODE,
    message: LEGACY_PATH_WARNING_MESSAGE,
    replacement: '@superfunctions/oauth-flow',
    removalTarget: 'plugfn@0.2.0',
  };
}

function isLegacyOAuthFlowDelegate(
  value: OAuthStateStore | LegacyOAuthFlowDelegate | undefined
): value is LegacyOAuthFlowDelegate {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getAuthorizationUrl' in value &&
    typeof value.getAuthorizationUrl === 'function' &&
    'exchangeCodeForToken' in value &&
    typeof value.exchangeCodeForToken === 'function' &&
    'refreshAccessToken' in value &&
    typeof value.refreshAccessToken === 'function' &&
    'verifyState' in value &&
    typeof value.verifyState === 'function'
  );
}
