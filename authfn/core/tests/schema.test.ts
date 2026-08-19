import { describe, expect, it } from 'vitest';
import { createTestServer } from '../src/__tests__/test-server.js';
import {
  AuthFnConflictError,
  getSchema,
  type AuthFnPlugin,
  type AuthFnRuntimeConfig
} from '../src/index.js';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';
import { authFnMultiRegionPlugin } from '@authfn/multi-region';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnSocialOAuthPlugin } from '@authfn/social-oauth';
import { authFnTwoFactorPlugin } from '@authfn/two-factor';

const config = (): AuthFnRuntimeConfig => ({
  database: {} as AuthFnRuntimeConfig['database'],
  namespace: 'authfn',
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
    authFnSocialOAuthPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin(),
    authFnMultiRegionPlugin()
  ]
});

describe('authfn schema composition', () => {
  it('returns deterministic table order for a fixed plugin config', () => {
    const first = getSchema(config());
    const second = getSchema(config());

    expect(first.schemas.map((table) => table.modelName)).toEqual([
      'users',
      'sessions',
      'password_credentials',
      'otp_challenges',
      'oauth_states',
      'oauth_tokens',
      'oauth_consents',
      'oauth_revocation_failures',
      'oauth_accounts',
      'api_keys',
      'two_factor_enrollments',
      'two_factor_recovery_codes',
      'two_factor_challenges',
      'region_profiles'
    ]);
    expect(second).toEqual(first);
    expect(first.schemas.find((table) => table.modelName === 'oauth_states')?.fields.state_id).toMatchObject({
      required: true,
      unique: true
    });
    expect(first.schemas.find((table) => table.modelName === 'oauth_tokens')?.fields.connection_id).toMatchObject({
      required: true,
      unique: true
    });
  });

  it('fails deterministically on duplicate table names', () => {
    const duplicatePlugin: AuthFnPlugin = {
      name: 'duplicate',
      schema: () => [
        {
          modelName: 'users',
          fields: {
            id: { type: 'string', required: true, fieldName: 'id' }
          }
        }
      ]
    };

    expect(() =>
      getSchema({
        ...config(),
        plugins: [duplicatePlugin]
      })
    ).toThrowError(AuthFnConflictError);
  });

  it('fails deterministically on duplicate column mappings within a table', () => {
    const conflictingPlugin: AuthFnPlugin = {
      name: 'conflicting',
      schema: () => [
        {
          modelName: 'conflicting_table',
          fields: {
            firstField: { type: 'string', required: true, fieldName: 'shared' },
            secondField: { type: 'string', required: true, fieldName: 'shared' }
          }
        }
      ]
    };

    expect(() =>
      getSchema({
        ...config(),
        plugins: [conflictingPlugin]
      })
    ).toThrowError(AuthFnConflictError);
  });

  it('produces stable route output across runs', () => {
    const first = createTestServer(config()).router.getRoutes().map((route) => `${route.method}:${route.path}`);
    const second = createTestServer(config()).router.getRoutes().map((route) => `${route.method}:${route.path}`);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(4);
  });
});
