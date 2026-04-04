import { expect, test } from '@playwright/test';
import { documentedTestIds, resetDemoScenario } from '../../shared/src/e2e/helpers.js';

const ids = documentedTestIds();
const clientBaseUrl = 'http://127.0.0.1:4010';
const serverBaseUrl = 'http://127.0.0.1:4310';

const primaryEmail = 'ada@example.com';
const password = 'Sup3rSecurePassphrase!';
const wrongPassword = 'WrongPassphrase123!';

test.beforeEach(async () => {
  const reset = await resetDemoScenario(serverBaseUrl, 'baseline');
  expect(reset.ok).toBe(true);
  expect(reset.data.seeded).toBe(true);
});

test('covers sign-up, sign-in, session inspection, revoke, sign-out, and wrong-password failure', async ({
  browser,
  page
}) => {
  await page.goto(clientBaseUrl);

  await page.getByTestId(ids.signUpEmailInput).fill(primaryEmail);
  await page.getByTestId(ids.signUpPasswordInput).fill(password);
  await page.getByTestId(ids.signUpSubmitButton).click();

  const authStatePanel = page.getByTestId(ids.authStatePanel);
  await expect(authStatePanel).toContainText(primaryEmail);

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto(clientBaseUrl);
  await secondPage.getByTestId(ids.signInEmailInput).fill(primaryEmail);
  await secondPage.getByTestId(ids.signInPasswordInput).fill(password);
  await secondPage.getByTestId(ids.signInSubmitButton).click();
  await expect(secondPage.getByTestId(ids.authStatePanel)).toContainText(primaryEmail);

  await page.getByTestId(ids.refreshSessionButton).click();
  await expect(authStatePanel).toContainText('"id"');

  const sessionListPanel = page.getByTestId(ids.sessionListPanel);
  await expect
    .poll(async () => {
      await page.getByTestId(ids.listSessionsButton).click();
      const items = await sessionListPanel.getByRole('listitem').allTextContents();
      return items.join(' | ');
    })
    .toContain('Secondary session');
  await expect(sessionListPanel).toContainText('Current session');
  await expect(sessionListPanel).toContainText('Secondary session');

  const secondarySessionRow = sessionListPanel.getByRole('listitem').filter({
    hasText: 'Secondary session'
  });
  await expect(secondarySessionRow).toHaveCount(1);
  await secondarySessionRow.getByRole('button', { name: 'Revoke session' }).click();
  await expect(secondarySessionRow).toHaveCount(0);
  await expect(sessionListPanel).not.toContainText('Secondary session');

  await secondPage.reload();
  await secondPage.getByTestId(ids.refreshSessionButton).click();
  await expect(secondPage.getByTestId(ids.authStatePanel)).toContainText('No active session');

  await page.getByTestId(ids.signOutButton).click();
  await expect(authStatePanel).toContainText('No active session');

  await page.getByTestId(ids.signInEmailInput).fill(primaryEmail);
  await page.getByTestId(ids.signInPasswordInput).fill(wrongPassword);
  await page.getByTestId(ids.signInSubmitButton).click();

  const errorPanel = page.getByTestId(ids.authErrorPanel);
  await expect(errorPanel).toContainText('AUTHFN_INVALID_CREDENTIALS');
  await expect(errorPanel).toContainText('Invalid email or password');

  await secondContext.close();
});
