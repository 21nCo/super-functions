import { expect, test } from '@playwright/test';
import { documentedTestIds, resetDemoScenario } from '../../shared/src/e2e/helpers.js';

const ids = documentedTestIds();
const clientBaseUrl = 'http://127.0.0.1:4012';
const serverBaseUrl = 'http://127.0.0.1:4312';

test.beforeEach(async () => {
  const reset = await resetDemoScenario(serverBaseUrl, 'baseline');
  expect(reset.ok).toBe(true);
  expect(reset.data.seeded).toBe(true);
});

test('covers fake-provider redirect callback, disconnect, and disallowed redirect failures', async ({ page }) => {
  await page.goto(clientBaseUrl);

  await page.getByTestId(ids.socialGoogleButton).click();
  await page.waitForURL('http://127.0.0.1:4012/?provider=google&flow=social');

  await expect(page.getByTestId(ids.authStatePanel)).toContainText('google.user@example.test');
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('oauth-google');

  await page.getByTestId(ids.socialDisconnectButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('No auth error');
  await expect(page.getByText('Disconnected google from the current authfn user.')).toBeVisible();

  await page.getByTestId(ids.socialDisconnectButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_NOT_FOUND');
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('OAuth account not found');

  await page.getByTestId(ids.socialInvalidRedirectButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_REDIRECT_URI_DISALLOWED');
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('Redirect target is not allowlisted');
});
