import {
  createOAuthFetchLike,
  type OAuthClientSecretResolver,
  type OAuthFetchLike
} from '@superfunctions/oauth-http';
import type { SuperfunctionObservability } from '@superfunctions/observability';
import type {
  AuthFnEvent,
  AuthFnSocialProviderId
} from 'authfn';
import type {
  OAuthTokenExchangeDiagnostic,
  OAuthTokenExchangeDiagnosticsConfig
} from './types.js';

const MAX_APPLE_CLIENT_SECRET_TTL_SECONDS = 180 * 24 * 60 * 60;
const DEFAULT_APPLE_CLIENT_SECRET_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface OAuthTokenDiagnosticFetcherInput {
  fetcher?: OAuthFetchLike;
  observability?: SuperfunctionObservability<AuthFnEvent>;
  requestId?: string;
  diagnostics?: false | OAuthTokenExchangeDiagnosticsConfig;
  /** Timeout for the shared global OAuth fetcher. Ignored when fetcher is provided. */
  timeoutMs?: number;
}

export interface AppleClientSecretResolverInput {
  staticJwt?: string;
  privateKey?: string;
  teamId?: string;
  keyId?: string;
  clientId?: string;
  ttlSeconds?: number;
}

interface AppleClientSecretSignerInput {
  keyId: string;
  privateKey: string;
  teamId: string;
  ttlSeconds?: number;
}

/** Creates an OAuth fetch implementation that emits redacted token exchange diagnostics. */
export function createOAuthTokenDiagnosticFetcher(
  input: OAuthTokenDiagnosticFetcherInput
): OAuthFetchLike {
  const fetcher = input.fetcher ?? createOAuthFetchLike(input.timeoutMs);
  const diagnostics = input.diagnostics === false ? undefined : input.diagnostics;
  return async (url, init) => {
    const response = await fetcher(url, init);
    const rawBody = await response.text();
    const provider = resolveOAuthTokenProvider(url);
    const shouldEmit = Boolean(
      provider &&
      input.diagnostics !== false &&
      (!response.ok || diagnostics?.includeSuccessful === true)
    );

    if (provider && shouldEmit) {
      const diagnostic: OAuthTokenExchangeDiagnostic = {
        provider,
        ok: response.ok,
        status: response.status,
        request: summarizeOAuthTokenRequest(provider, init.body),
        response: summarizeOAuthTokenResponse(response.status, rawBody)
      };
      try {
        input.observability?.logger?.[response.ok ? 'info' : 'warn']?.(
          `${provider} oauth token exchange`,
          {
            request: diagnostic.request,
            response: diagnostic.response
          }
        );
      } catch {
        // Diagnostics must never change the outcome of a successful token exchange.
      }
      try {
        await input.observability?.events.emit({
          domain: 'authfn',
          type: 'authfn.oauth.token_exchange',
          requestId: input.requestId ?? '',
          provider,
          severity: response.ok ? 'info' : 'warn',
          outcome: response.ok ? 'ok' : 'error',
          metadata: diagnostic as unknown as Record<string, unknown>
        });
      } catch {
        // Diagnostics must never change the outcome of a successful token exchange.
      }
      try {
        await diagnostics?.sink?.(diagnostic);
      } catch {
        // Diagnostics must never change the outcome of a successful token exchange.
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      async text() {
        return rawBody;
      }
    };
  };
}

/** Creates an Apple OAuth client secret resolver from either a static JWT or signing key material. */
export function createAppleClientSecretResolver(
  input: AppleClientSecretResolverInput
): OAuthClientSecretResolver | undefined {
  if (input.staticJwt) {
    return () => ({
      clientSecret: input.staticJwt as string
    });
  }

  if (!input.privateKey || !input.teamId || !input.keyId) {
    return undefined;
  }

  const signer = createAppleClientSecretSigner({
    keyId: input.keyId,
    privateKey: input.privateKey,
    teamId: input.teamId,
    ttlSeconds: input.ttlSeconds
  });
  return async (context) => ({
    clientSecret: await signer(input.clientId ?? context.clientId)
  });
}

function createAppleClientSecretSigner(input: AppleClientSecretSignerInput) {
  const cached = new Map<string, { clientSecret: string; expiresAtMs: number }>();

  return async (clientId: string) => {
    const nowMs = Date.now();
    const existing = cached.get(clientId);
    if (existing && existing.expiresAtMs - nowMs > 5 * 60 * 1000) {
      return existing.clientSecret;
    }

    const issuedAt = Math.floor(nowMs / 1000);
    const ttlSeconds = resolveAppleClientSecretTtlSeconds(input.ttlSeconds);
    const expiresAt = issuedAt + ttlSeconds;
    const header = {
      alg: 'ES256',
      kid: input.keyId,
      typ: 'JWT'
    };
    const payload = {
      iss: input.teamId,
      iat: issuedAt,
      exp: expiresAt,
      aud: 'https://appleid.apple.com',
      sub: clientId
    };
    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const privateKey = await importApplePrivateKey(input.privateKey);
    const signature = await globalThis.crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(signingInput)
    );
    const clientSecret = `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
    cached.set(clientId, {
      clientSecret,
      expiresAtMs: expiresAt * 1000
    });
    return clientSecret;
  };
}

function resolveOAuthTokenProvider(url: string): AuthFnSocialProviderId | undefined {
  if (url === 'https://appleid.apple.com/auth/token') {
    return 'apple';
  }
  if (url === 'https://oauth2.googleapis.com/token') {
    return 'google';
  }
  if (url === 'https://github.com/login/oauth/access_token') {
    return 'github';
  }
  return undefined;
}

function summarizeOAuthTokenRequest(
  provider: AuthFnSocialProviderId,
  body: string | undefined
): Record<string, unknown> {
  const params = new URLSearchParams(body ?? '');
  const clientSecret = params.get('client_secret') ?? undefined;
  return {
    grantType: params.get('grant_type'),
    clientId: params.get('client_id'),
    redirectUri: params.get('redirect_uri'),
    code: summarizeOAuthCode(params.get('code')),
    hasCodeVerifier: Boolean(params.get('code_verifier')),
    ...(provider === 'apple'
      ? { clientSecret: summarizeJwt(clientSecret) }
      : { hasClientSecret: Boolean(clientSecret) })
  };
}

function summarizeOAuthCode(value: string | null) {
  if (!value) {
    return { present: false };
  }

  return {
    present: true,
    length: value.length,
    hasWhitespace: /\s/.test(value),
    hasPlus: value.includes('+'),
    hasSlash: value.includes('/'),
    hasEquals: value.includes('='),
    startsWithExpectedPrefix: value.startsWith('c')
  };
}

function summarizeOAuthTokenResponse(status: number, rawBody: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = new URLSearchParams(rawBody);
  }

  if (parsed instanceof URLSearchParams) {
    return {
      status,
      error: parsed.get('error'),
      errorDescription: parsed.get('error_description')
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { status };
  }

  const record = parsed as Record<string, unknown>;
  return {
    status,
    error: typeof record.error === 'string' ? record.error : undefined,
    errorDescription:
      typeof record.error_description === 'string'
        ? record.error_description
        : undefined,
    hasIdToken: typeof record.id_token === 'string',
    hasAccessToken: typeof record.access_token === 'string'
  };
}

function summarizeJwt(value: string | undefined) {
  if (!value) {
    return { present: false };
  }

  const parts = value.split('.');
  if (parts.length !== 3) {
    return { present: true, validShape: false };
  }

  return {
    present: true,
    validShape: true,
    header: parseJwtPart(parts[0]),
    payload: summarizeJwtPayload(parseJwtPart(parts[1])),
    signatureBytes: decodeBase64Url(parts[2]).length
  };
}

function summarizeJwtPayload(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  return {
    iss: value.iss,
    sub: value.sub,
    aud: value.aud,
    iat:
      typeof value.iat === 'number'
        ? new Date(value.iat * 1000).toISOString()
        : undefined,
    exp:
      typeof value.exp === 'number'
        ? new Date(value.exp * 1000).toISOString()
        : undefined
  };
}

function parseJwtPart(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveAppleClientSecretTtlSeconds(value: number | undefined) {
  if (Number.isFinite(value) && value !== undefined && value > 0) {
    return Math.min(Math.floor(value), MAX_APPLE_CLIENT_SECRET_TTL_SECONDS);
  }
  return DEFAULT_APPLE_CLIENT_SECRET_TTL_SECONDS;
}

async function importApplePrivateKey(privateKey: string) {
  return globalThis.crypto.subtle.importKey(
    'pkcs8',
    decodePem(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

function decodePem(pem: string) {
  const normalized = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return decodeBase64(normalized);
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return decodeBase64(padded);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
