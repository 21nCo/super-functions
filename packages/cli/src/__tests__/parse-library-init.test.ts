import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLibraryInitializations } from '../utils/parse-library-init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('parseLibraryInitializations', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, `parse-library-init-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('preserves function-call descriptors and evaluated arguments for authfn plugins', () => {
    const filePath = path.join(testDir, 'auth.ts');
    fs.writeFileSync(
      filePath,
      `
      import { createAuthFn, authFnPasswordPlugin, authFnApiKeyPlugin } from '@authfn/core';

      const apiKeyConfig = { secretPrefix: 'demo' };

      function createDelivery() {
        return { send: () => ({ sent: true }) };
      }

      const auth = createAuthFn({
        database: db,
        namespace: 'authfn_pw_demo',
        plugins: [
          authFnPasswordPlugin({
            requireEmailVerifiedForSignIn: true,
            otp: {
              maxAttempts: 5,
              delivery: createDelivery()
            }
          }),
          authFnApiKeyPlugin(apiKeyConfig)
        ]
      });

      export default auth;
      `
    );

    const parsed = parseLibraryInitializations(filePath, {
      createAuthFn: '@authfn/core'
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.config).toMatchObject({
      namespace: 'authfn_pw_demo',
      plugins: [
        {
          __functionCall: 'authFnPasswordPlugin',
          __args: [
            {
              requireEmailVerifiedForSignIn: true,
              otp: {
                maxAttempts: 5,
                delivery: {
                  __functionCall: 'createDelivery',
                  __args: []
                }
              }
            }
          ]
        },
        {
          __functionCall: 'authFnApiKeyPlugin',
          __args: [{ secretPrefix: 'demo' }]
        }
      ]
    });
  });
});
