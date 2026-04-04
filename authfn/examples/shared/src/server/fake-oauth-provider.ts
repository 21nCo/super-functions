import { createRouter, type Router } from '@superfunctions/http';
import {
  AuthFnExampleError,
  jsonError,
  jsonSuccess
} from './demo-routes.js';

export type FakeOAuthProviderId = 'google' | 'github' | 'apple';

export interface FakeOAuthUserProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  providerAccountId?: string;
  profile?: Record<string, unknown>;
}

export interface FakeOAuthProviderConfig {
  providerId: FakeOAuthProviderId;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
}

interface AuthorizationCodeRecord {
  providerId: FakeOAuthProviderId;
  profile: FakeOAuthUserProfile;
  redirectUri: string;
}

interface AccessTokenRecord {
  providerId: FakeOAuthProviderId;
  profile: FakeOAuthUserProfile;
}

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

export class FakeOAuthProvider {
  readonly router: Router;
  readonly providers: Record<FakeOAuthProviderId, FakeOAuthProviderConfig>;

  #authorizationCodes = new Map<string, AuthorizationCodeRecord>();
  #accessTokens = new Map<string, AccessTokenRecord>();
  #profiles: Record<FakeOAuthProviderId, FakeOAuthUserProfile>;

  constructor(baseUrl: string) {
    this.providers = {
      google: createProviderConfig(baseUrl, 'google'),
      github: createProviderConfig(baseUrl, 'github'),
      apple: createProviderConfig(baseUrl, 'apple')
    };
    this.#profiles = {
      google: createDefaultProfile('google'),
      github: createDefaultProfile('github'),
      apple: createDefaultProfile('apple')
    };
    this.router = createFakeOAuthProviderRouter(this);
  }

  reset(): void {
    this.#authorizationCodes.clear();
    this.#accessTokens.clear();
  }

  setProfile(providerId: FakeOAuthProviderId, profile: Partial<FakeOAuthUserProfile>): void {
    this.#profiles[providerId] = {
      ...this.#profiles[providerId],
      ...profile
    };
  }

  getProfile(providerId: FakeOAuthProviderId): FakeOAuthUserProfile {
    return {
      ...this.#profiles[providerId]
    };
  }

  issueAuthorizationCode(providerId: FakeOAuthProviderId, redirectUri: string): string {
    assertExampleLocalUrl(redirectUri);
    const code = `fake_code_${Math.random().toString(36).slice(2, 10)}`;
    this.#authorizationCodes.set(code, {
      providerId,
      profile: this.getProfile(providerId),
      redirectUri
    });
    return code;
  }

  exchangeAuthorizationCode(providerId: FakeOAuthProviderId, code: string, redirectUri: string): {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
    idToken: string;
  } {
    const record = this.#authorizationCodes.get(code);
    if (!record || record.providerId !== providerId || record.redirectUri !== redirectUri) {
      throw new AuthFnExampleError(
        'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
        'Invalid fake OAuth authorization code exchange',
        {
          status: 400,
          details: {
            providerId
          }
        }
      );
    }

    this.#authorizationCodes.delete(code);

    const accessToken = `fake_token_${Math.random().toString(36).slice(2, 10)}`;
    this.#accessTokens.set(accessToken, {
      providerId,
      profile: record.profile
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      idToken: JSON.stringify({
        sub: record.profile.sub,
        email: record.profile.email
      })
    };
  }

  getProfileFromAccessToken(providerId: FakeOAuthProviderId, accessToken: string): FakeOAuthUserProfile {
    const record = this.#accessTokens.get(accessToken);
    if (!record || record.providerId !== providerId) {
      throw new AuthFnExampleError(
        'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
        'Invalid fake OAuth access token',
        {
          status: 401,
          details: {
            providerId
          }
        }
      );
    }

    return record.profile;
  }
}

export function createFakeOAuthProvider(baseUrl: string): FakeOAuthProvider {
  return new FakeOAuthProvider(baseUrl);
}

export function assertExampleLocalUrl(target: string): void {
  const url = new URL(target);
  if (!LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new AuthFnExampleError(
      'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN',
      'External network access is forbidden for authfn example verification',
      {
        status: 500,
        details: {
          hostname: url.hostname
        }
      }
    );
  }
}

function createFakeOAuthProviderRouter(provider: FakeOAuthProvider): Router {
  return createRouter({
    routes: [
      {
        method: 'GET',
        path: '/fake-oauth/:provider/authorize',
        handler: async (request, context) => {
          try {
            const providerId = readProviderId(context.params.provider);
            const redirectUri = readRequiredParam(context.query.get('redirect_uri'), 'redirect_uri');
            const state = readRequiredParam(context.query.get('state'), 'state');

            if (context.query.get('deny') === '1') {
              const deniedUrl = new URL(redirectUri);
              deniedUrl.searchParams.set('error', 'access_denied');
              deniedUrl.searchParams.set('state', state);
              return Response.redirect(deniedUrl.toString(), 302);
            }

            const code = provider.issueAuthorizationCode(providerId, redirectUri);
            const redirectTo = new URL(redirectUri);
            redirectTo.searchParams.set('code', code);
            redirectTo.searchParams.set('state', state);
            return Response.redirect(redirectTo.toString(), 302);
          } catch (error) {
            return jsonError(request, error);
          }
        }
      },
      {
        method: 'POST',
        path: '/fake-oauth/:provider/token',
        handler: async (request, context) => {
          try {
            const providerId = readProviderId(context.params.provider);
            const body = await request.formData();
            const code = readRequiredParam(readFormData(body, 'code'), 'code');
            const redirectUri = readRequiredParam(readFormData(body, 'redirect_uri'), 'redirect_uri');
            const token = provider.exchangeAuthorizationCode(providerId, code, redirectUri);
            return jsonSuccess(request, {
              access_token: token.accessToken,
              token_type: token.tokenType,
              expires_in: token.expiresIn,
              id_token: token.idToken
            });
          } catch (error) {
            return jsonError(request, error);
          }
        }
      },
      {
        method: 'GET',
        path: '/fake-oauth/:provider/userinfo',
        handler: async (request, context) => {
          try {
            const providerId = readProviderId(context.params.provider);
            const accessToken = readBearerToken(request.headers.get('authorization'));
            const profile = provider.getProfileFromAccessToken(providerId, accessToken);
            return jsonSuccess(request, profile);
          } catch (error) {
            return jsonError(request, error);
          }
        }
      }
    ]
  });
}

function createProviderConfig(baseUrl: string, providerId: FakeOAuthProviderId): FakeOAuthProviderConfig {
  return {
    providerId,
    clientId: `demo-${providerId}-client`,
    clientSecret: `demo-${providerId}-secret`,
    authorizationEndpoint: `${baseUrl}/demo/fake-oauth/${providerId}/authorize`,
    tokenEndpoint: `${baseUrl}/demo/fake-oauth/${providerId}/token`,
    userInfoEndpoint: `${baseUrl}/demo/fake-oauth/${providerId}/userinfo`
  };
}

function createDefaultProfile(providerId: FakeOAuthProviderId): FakeOAuthUserProfile {
  return {
    sub: `${providerId}-user-1`,
    email: `${providerId}.user@example.test`,
    email_verified: true,
    name: `${providerId[0]?.toUpperCase() ?? providerId} demo user`,
    providerAccountId: `${providerId}-acct-1`
  };
}

function readProviderId(value: string): FakeOAuthProviderId {
  if (value === 'google' || value === 'github' || value === 'apple') {
    return value;
  }

  throw new AuthFnExampleError(
    'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
    'Unsupported fake OAuth provider',
    {
      status: 400,
      details: {
        provider: value
      }
    }
  );
}

function readRequiredParam(value: string | null, label: string): string {
  if (!value) {
    throw new AuthFnExampleError(
      'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
      `Missing required fake OAuth parameter: ${label}`,
      {
        status: 400,
        details: {
          label
        }
      }
    );
  }
  return value;
}

function readFormData(body: FormData, key: string): string | null {
  const value = body.get(key);
  return typeof value === 'string' ? value : null;
}

function readBearerToken(header: string | null): string {
  if (!header?.startsWith('Bearer ')) {
    throw new AuthFnExampleError(
      'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
      'Missing bearer token for fake OAuth userinfo request',
      {
        status: 401
      }
    );
  }

  return header.slice('Bearer '.length);
}
