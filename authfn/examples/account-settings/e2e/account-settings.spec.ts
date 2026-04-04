import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { documentedTestIds, resetDemoScenario } from '../../shared/src/e2e/helpers.js';

const ids = documentedTestIds();
const clientBaseUrl = 'http://127.0.0.1:4013';
const serverBaseUrl = 'http://127.0.0.1:4313';
const email = 'ada@example.com';
const password = 'Sup3rSecurePassphrase!';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

test.beforeEach(async () => {
  const reset = await resetDemoScenario(serverBaseUrl, 'baseline');
  expect(reset.ok).toBe(true);
  expect(reset.data.seeded).toBe(true);
});

test('covers 2fa enroll/confirm/challenge/disable and api key revoke failure', async ({ page }) => {
  await page.goto(clientBaseUrl);

  await page.getByTestId(ids.signUpEmailInput).fill(email);
  await page.getByTestId(ids.signUpPasswordInput).fill(password);
  await page.getByTestId(ids.signUpSubmitButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText(email);

  await page.getByTestId(ids.twoFactorEnrollButton).click();
  await expect(page.getByTestId(ids.twoFactorSecretPanel)).not.toContainText('No 2FA enrollment generated yet.');
  const secret = (await page.getByTestId(ids.twoFactorSecretPanel).textContent())?.trim() ?? '';
  expect(secret).toMatch(/^[A-Z2-7]+$/);

  await page.getByTestId(ids.twoFactorConfirmCodeInput).fill(generateTotp(secret));
  await page.getByTestId(ids.twoFactorConfirmButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('two-factor');

  await page.getByTestId(ids.signOutButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('No active session');

  await page.getByTestId(ids.signInEmailInput).fill(email);
  await page.getByTestId(ids.signInPasswordInput).fill(password);
  await page.getByTestId(ids.signInSubmitButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_2FA_REQUIRED');

  await page.getByTestId(ids.twoFactorChallengeCodeInput).fill('000000');
  await page.getByTestId(ids.twoFactorChallengeButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_2FA_INVALID_CODE');

  await page.getByTestId(ids.twoFactorChallengeCodeInput).fill(generateTotp(secret));
  await page.getByTestId(ids.twoFactorChallengeButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('two-factor');

  await page.getByTestId(ids.apiKeyNameInput).fill('playwright');
  await page.getByTestId(ids.apiKeyCreateButton).click();
  await expect(page.getByTestId(ids.apiKeySecretPanel)).toContainText('ak_');
  const apiKeySecret = (await page.getByTestId(ids.apiKeySecretPanel).textContent())?.trim() ?? '';
  expect(apiKeySecret).toMatch(/^ak_/);

  await page.getByTestId(ids.apiKeyProtectedCheckButton).click();
  await expect(page.getByTestId(ids.apiKeyProtectedResultPanel)).toContainText('"authenticated": true');

  const apiKeyRow = page.getByTestId(ids.apiKeyListPanel).getByRole('listitem').filter({
    hasText: 'playwright'
  });
  await apiKeyRow.getByRole('button', { name: 'Revoke API key' }).click();
  await expect(page.getByTestId(ids.eventLogPanel)).toContainText('authfn.api_key.revoked');

  await page.getByTestId(ids.apiKeyProtectedCheckButton).click();
  await expect(page.getByTestId(ids.apiKeyProtectedResultPanel)).toContainText('AUTHFN_API_KEY_REVOKED');

  await page.getByTestId(ids.twoFactorDisableCodeInput).fill(generateTotp(secret));
  await page.getByTestId(ids.twoFactorDisableButton).click();
  await expect(page.getByTestId(ids.twoFactorSecretPanel)).toContainText('No 2FA enrollment generated yet.');

  await page.getByTestId(ids.signOutButton).click();
  await page.getByTestId(ids.signInEmailInput).fill(email);
  await page.getByTestId(ids.signInPasswordInput).fill(password);
  await page.getByTestId(ids.signInSubmitButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText(email);
  await expect(page.getByTestId(ids.authErrorPanel)).not.toContainText('AUTHFN_2FA_REQUIRED');
});

function decodeBase32(secret: string): Buffer {
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const char of secret.replace(/=+$/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      continue;
    }

    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotp(secret: string, now: Date = new Date(), digits = 6, periodSeconds = 30): string {
  const counter = Math.floor(now.getTime() / 1000 / periodSeconds);
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}
