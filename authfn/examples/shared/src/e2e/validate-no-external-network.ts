import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExampleLocalUrl } from '../server/fake-oauth-provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesRoot = path.resolve(__dirname, '../../..');
const socialOAuthAuthFile = path.join(examplesRoot, 'social-oauth/server/src/auth.ts');

const allowedLocalUrls = [
  'http://127.0.0.1:4310/auth/session',
  'http://127.0.0.1:4312/demo/fake-oauth/google/authorize',
  'http://localhost:4316/auth/environment'
];

const blockedExternalUrls = [
  'https://accounts.google.com/o/oauth2/v2/auth',
  'https://github.com/login/oauth/access_token',
  'https://evil.example.com/callback'
];

void main().catch((error: unknown) => {
  reportFailure(error);
});

async function main(): Promise<void> {
  for (const target of allowedLocalUrls) {
    assertExampleLocalUrl(target);
  }

  for (const target of blockedExternalUrls) {
    try {
      assertExampleLocalUrl(target);
      failExternalNetwork(target, 'Expected the external target to be rejected');
    } catch (error) {
      const normalized = normalizeFailure(error);
      if (normalized.code !== 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN') {
        throw normalized;
      }
    }
  }

  const socialOAuthAuthSource = readRequiredFile(socialOAuthAuthFile);
  if (!socialOAuthAuthSource.includes('assertExampleLocalUrl(input);')) {
    failExternalNetwork(
      socialOAuthAuthFile,
      'Social OAuth fetcher must guard non-local fallback requests with assertExampleLocalUrl(input);'
    );
  }

  console.log(JSON.stringify({
    status: 'pass',
    assertions: {
      allProvidersWereLocal: true,
      externalHostsRejected: true
    }
  }, null, 2));
}

function readRequiredFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    failExternalNetwork(filePath, 'Required external-network contract file is missing');
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function failExternalNetwork(target: string, message: string): never {
  const error = new Error(message) as Error & {
    code: 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN';
    details?: Record<string, unknown>;
  };
  error.code = 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN';
  error.details = {
    target
  };
  throw error;
}

function reportFailure(error: unknown): never {
  const normalized = normalizeFailure(error);
  console.error(JSON.stringify({
    status: 'fail',
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details
    }
  }, null, 2));
  process.exit(1);
}

function normalizeFailure(error: unknown): {
  code: 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN';
  message: string;
  details?: Record<string, unknown>;
} {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN'
  ) {
    return {
      code: 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN',
      message: error instanceof Error ? error.message : 'External network validation failed',
      details: 'details' in error && error.details && typeof error.details === 'object'
        ? error.details as Record<string, unknown>
        : undefined
    };
  }

  return {
    code: 'AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN',
    message: error instanceof Error ? error.message : 'External network validation failed'
  };
}
