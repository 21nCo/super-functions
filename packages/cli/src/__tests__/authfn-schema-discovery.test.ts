import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSchema } from '../../../../authfn/core/src/index.js';
import { resolveLibraryPackageEntryPoint } from '../commands/generate-schema.js';
import { discoverSuperfunctionsPackages, getSuperfunctionsRegistry } from '../utils/discover-packages.js';
import { parseLibraryInitializations } from '../utils/parse-library-init.js';
import { CliSchemaGenerationError, generateLibraryAbstractSchema } from '../utils/schema-generators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const authFnPackageJsonPath = path.join(repoRoot, 'authfn', 'core', 'package.json');

describe('authfn scoped schema discovery', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, `authfn-discovery-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, 'node_modules', '@authfn', 'core'), {
      recursive: true
    });
    fs.writeFileSync(
      path.join(testDir, 'node_modules', '@authfn', 'core', 'package.json'),
      fs.readFileSync(authFnPackageJsonPath, 'utf-8')
    );
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('discovers @authfn/core metadata and generates schema from a parsed plugin-rich config', async () => {
    const configPath = path.join(testDir, 'auth.ts');
    fs.writeFileSync(
      configPath,
      `
      import {
        createAuthFn,
        authFnApiKeyPlugin,
        authFnEmailOtpPlugin,
        authFnMultiRegionPlugin,
        authFnPasswordPlugin,
        authFnSocialOAuthPlugin,
        authFnTwoFactorPlugin
      } from '@authfn/core';

      const auth = createAuthFn({
        database: db,
        namespace: 'authfn_pw_demo',
        plugins: [
          authFnPasswordPlugin(),
          authFnEmailOtpPlugin({ maxAttempts: 5 }),
          authFnSocialOAuthPlugin({
            providers: {
              github: {
                clientId: 'github-client'
              }
            }
          }),
          authFnApiKeyPlugin({ secretPrefix: 'demo' }),
          authFnTwoFactorPlugin({ issuer: 'Demo App' }),
          authFnMultiRegionPlugin({
            defaultRegionId: 'us',
            regions: [
              {
                regionId: 'us',
                authority: 'https://us.example.com'
              }
            ]
          })
        ]
      });

      export default auth;
      `
    );

    const discoveredPackages = discoverSuperfunctionsPackages(testDir);
    expect(discoveredPackages).toContainEqual(
      expect.objectContaining({
        packageName: '@authfn/core',
        initFunction: 'createAuthFn',
        libraryNames: ['authfn']
      })
    );

    const registry = getSuperfunctionsRegistry(testDir);
    expect(registry).toEqual({
      createAuthFn: {
        packageName: '@authfn/core',
        libraryName: 'authfn'
      }
    });

    const parsedInitializations = parseLibraryInitializations(configPath, registry);
    expect(parsedInitializations).toHaveLength(1);
    expect(parsedInitializations[0]).toMatchObject({
      libraryName: 'authfn',
      packageName: '@authfn/core',
      functionName: 'createAuthFn',
      config: {
        namespace: 'authfn_pw_demo',
        plugins: [
          { __functionCall: 'authFnPasswordPlugin', __args: [] },
          { __functionCall: 'authFnEmailOtpPlugin', __args: [{ maxAttempts: 5 }] },
          {
            __functionCall: 'authFnSocialOAuthPlugin',
            __args: [
              {
                providers: {
                  github: {
                    clientId: 'github-client'
                  }
                }
              }
            ]
          },
          { __functionCall: 'authFnApiKeyPlugin', __args: [{ secretPrefix: 'demo' }] },
          { __functionCall: 'authFnTwoFactorPlugin', __args: [{ issuer: 'Demo App' }] },
          {
            __functionCall: 'authFnMultiRegionPlugin',
            __args: [
              {
                defaultRegionId: 'us',
                regions: [{ regionId: 'us', authority: 'https://us.example.com' }]
              }
            ]
          }
        ]
      }
    });

    const schema = await generateLibraryAbstractSchema(
      { getSchema },
      parsedInitializations[0]!.config
    );

    expect(schema.schemas.map((table) => table.modelName)).toEqual([
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
    expect(Object.keys(schema.schemas[0]!.fields)).toEqual([
      'createdAt',
      'emailVerifiedAt',
      'id',
      'metadata',
      'primaryEmail',
      'updatedAt'
    ]);
  });

  it('resolves the published @authfn/core default export entry point for CLI imports', () => {
    const packageJson = JSON.parse(fs.readFileSync(authFnPackageJsonPath, 'utf-8'));

    expect(resolveLibraryPackageEntryPoint(packageJson)).toBe('./dist/index.js');
  });

  it('fails with a structured invalid-config error for unsupported authfn schema plugin descriptors', async () => {
    await expect(
      generateLibraryAbstractSchema(
        { getSchema },
        {
          database: undefined,
          namespace: 'authfn_pw_demo',
          plugins: [{ __functionCall: 'customPlugin', __args: [] }]
        }
      )
    ).rejects.toMatchObject({
      code: 'AUTHFN_CONFIG_INVALID',
      message: 'Unsupported authfn schema plugin descriptor',
      details: {
        factoryName: 'customPlugin'
      }
    });
  });

  it('fails with a structured CLI error when getSchema is missing', async () => {
    await expect(generateLibraryAbstractSchema({}, { namespace: 'auth' })).rejects.toMatchObject<
      Partial<CliSchemaGenerationError>
    >({
      code: 'CLI_SCHEMA_GENERATION_ERROR',
      details: {
        reason: 'missing-get-schema'
      }
    });
  });
});
