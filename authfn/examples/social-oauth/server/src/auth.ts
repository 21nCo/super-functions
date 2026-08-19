import { authFnPlugins, authfn, type AuthFnEvent, type AuthFnServer } from 'authfn';
import { authFnSocialOAuthPlugin, type AuthFnSocialProfile, type AuthFnSocialProviderId, type SocialOAuthPluginRuntimeConfig } from '@authfn/social-oauth';
import {
  assertExampleLocalUrl,
  type FakeOAuthProvider,
  type FakeOAuthUserProfile
} from '@authfn/examples-shared';
import type { Adapter } from '@superfunctions/db';

export const SOCIAL_OAUTH_NAMESPACE = 'authfn_social_oauth';
export const SOCIAL_OAUTH_COOKIE_PREFIX = 'authfn-social-oauth';

const SOCIAL_PROVIDER_IDS = ['google', 'github', 'apple'] as const satisfies AuthFnSocialProviderId[];
const TOKEN_ENDPOINTS: Record<AuthFnSocialProviderId, string> = {
  google: 'https://oauth2.googleapis.com/token',
  github: 'https://github.com/login/oauth/access_token',
  apple: 'https://appleid.apple.com/auth/token'
};
const REVOCATION_ENDPOINTS: Record<AuthFnSocialProviderId, string> = {
  google: 'https://oauth2.googleapis.com/revoke',
  github: 'https://api.github.com/applications/{client_id}/token',
  apple: 'https://appleid.apple.com/auth/revoke'
};

export const socialOAuthAuthApp = authfn({
  namespace: SOCIAL_OAUTH_NAMESPACE,
  plugins: createSocialOAuthPlugins()
});

export const socialOAuthSchema = socialOAuthAuthApp.getSchema();

export function createSocialOAuthAuth(options: {
  database: Adapter;
  clientOrigin: string;
  fakeOAuthProvider: FakeOAuthProvider;
  onEvent?(event: AuthFnEvent): Promise<void> | void;
}): AuthFnServer {
  return socialOAuthAuthApp.createServer({
    database: options.database,
    environment: {
      resolve(request) {
        const url = new URL(request.url);
        return {
          issuer: url.origin,
          baseUrl: url.origin,
          cookie: {
            prefix: SOCIAL_OAUTH_COOKIE_PREFIX,
            secure: !isLocalHostname(url.hostname),
            sameSite: 'lax'
          }
        };
      }
    },
    observability: {
      events: options.onEvent
    },
    pluginRuntime: {
      socialOAuth: createSocialOAuthRuntimeConfig({
        clientOrigin: options.clientOrigin,
        fakeOAuthProvider: options.fakeOAuthProvider
      })
    }
  });
}

function createSocialOAuthPlugins() {
  return authFnPlugins(
    authFnSocialOAuthPlugin()
  );
}

function createSocialOAuthRuntimeConfig(input: {
  clientOrigin: string;
  fakeOAuthProvider: FakeOAuthProvider;
}): SocialOAuthPluginRuntimeConfig {
  const fetcher = createFakeProviderFetcher(input.fakeOAuthProvider);

  return {
    fetcher,
    providers: Object.fromEntries(
      SOCIAL_PROVIDER_IDS.map((providerId) => [
        providerId,
        {
          clientId: `demo-${providerId}-client`,
          clientSecret: `demo-${providerId}-secret`,
          allowlistedReturnTo: [buildReturnTarget(input.clientOrigin, providerId)],
          profileResolver: async ({ tokenSet }) =>
            resolveFakeProviderProfile({
              providerId,
              accessToken: tokenSet.accessToken,
              fakeOAuthProvider: input.fakeOAuthProvider
            })
        }
      ])
    )
  };
}

async function resolveFakeProviderProfile(input: {
  providerId: AuthFnSocialProviderId;
  accessToken?: string;
  fakeOAuthProvider: FakeOAuthProvider;
}): Promise<AuthFnSocialProfile> {
  const profile = input.fakeOAuthProvider.getProfileFromAccessToken(
    input.providerId,
    input.accessToken ?? ''
  ) as FakeOAuthUserProfile;

  return {
    providerAccountId: profile.providerAccountId ?? profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified ?? true,
    name: profile.name,
    profile: {
      sub: profile.sub,
      email: profile.email,
      emailVerified: profile.email_verified ?? true,
      name: profile.name
    }
  };
}

function createFakeProviderFetcher(fakeOAuthProvider: FakeOAuthProvider) {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    for (const providerId of SOCIAL_PROVIDER_IDS) {
      if (input === TOKEN_ENDPOINTS[providerId]) {
        return proxyFakeTokenResponse(fakeOAuthProvider, providerId, init);
      }
      if (input === REVOCATION_ENDPOINTS[providerId]) {
        return new Response('', {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        });
      }
    }

    assertExampleLocalUrl(input);
    return fetch(input, init);
  };
}

async function proxyFakeTokenResponse(
  fakeOAuthProvider: FakeOAuthProvider,
  providerId: AuthFnSocialProviderId,
  init?: RequestInit
): Promise<Response> {
  const body = readRequestForm(init?.body);
  const code = body.get('code');
  const redirectUri = body.get('redirect_uri');
  if (!code || !redirectUri) {
    return new Response(
      JSON.stringify({
        error: 'invalid_request',
        error_description: 'Missing required token exchange parameters'
      }),
      {
        status: 400,
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  }

  const token = fakeOAuthProvider.exchangeAuthorizationCode(providerId, code, redirectUri);

  return new Response(JSON.stringify({
    access_token: token.accessToken,
    token_type: token.tokenType,
    expires_in: token.expiresIn,
    id_token: token.idToken
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}

function buildReturnTarget(clientOrigin: string, providerId: AuthFnSocialProviderId): string {
  const url = new URL(clientOrigin);
  url.searchParams.set('provider', providerId);
  url.searchParams.set('flow', 'social');
  return url.toString();
}

function isLocalHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

function readRequestForm(body: BodyInit | null | undefined): URLSearchParams {
  if (!body) {
    return new URLSearchParams();
  }

  if (typeof body === 'string') {
    return new URLSearchParams(body);
  }

  if (body instanceof URLSearchParams) {
    return body;
  }

  if (body instanceof FormData) {
    const params = new URLSearchParams();
    body.forEach((value, key) => {
      if (typeof value === 'string') {
        params.set(key, value);
      }
    });
    return params;
  }

  return new URLSearchParams(String(body));
}
