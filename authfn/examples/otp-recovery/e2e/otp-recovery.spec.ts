import { expect, test } from '@playwright/test';
import { documentedTestIds, getLatestDemoOtp, resetDemoScenario } from '../../shared/src/e2e/helpers.js';

const ids = documentedTestIds();
const clientBaseUrl = 'http://127.0.0.1:4011';
const serverBaseUrl = 'http://127.0.0.1:4311';

const email = 'ada@example.com';
const originalPassword = 'Sup3rSecurePassphrase!';
const newPassword = 'An0therSecurePassphrase!';

test.beforeEach(async () => {
  const reset = await resetDemoScenario(serverBaseUrl, 'baseline');
  expect(reset.ok).toBe(true);
  expect(reset.data.seeded).toBe(true);
});

test('covers verify-email OTP, OTP sign-in, password reset, replay, and invalid failures', async ({ page }) => {
  await page.goto(clientBaseUrl);

  await page.getByTestId(ids.signUpEmailInput).fill(email);
  await page.getByTestId(ids.signUpPasswordInput).fill(originalPassword);
  await page.getByTestId(ids.signUpSubmitButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText(email);

  await page.getByTestId(ids.verifyEmailSendButton).click();
  const verifyEmailOtp = await waitForLatestDemoOtp({
    purpose: 'verify-email',
    email
  });
  await expect(page.getByTestId(ids.otpInboxPanel)).toContainText(verifyEmailOtp.data.message.code);
  await page.getByTestId(ids.verifyEmailCodeInput).fill(verifyEmailOtp.data.message.code);
  await page.getByTestId(ids.verifyEmailSubmitButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('No auth error');

  await page.getByTestId(ids.verifyEmailSubmitButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_OTP_REPLAYED');

  await page.getByTestId(ids.signOutButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('No active session');

  await page.getByTestId(ids.otpSignInSendButton).click();
  const otpSignInMessage = await waitForLatestDemoOtp({
    purpose: 'sign-in',
    email
  });
  await expect(page.getByTestId(ids.otpInboxPanel)).toContainText(otpSignInMessage.data.message.code);
  await page.getByTestId(ids.otpSignInCodeInput).fill('000000');
  await page.getByTestId(ids.otpSignInSubmitButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_OTP_INVALID');

  await page.getByTestId(ids.otpSignInCodeInput).fill(otpSignInMessage.data.message.code);
  await page.getByTestId(ids.otpSignInSubmitButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('email-otp');

  await page.getByTestId(ids.signOutButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText('No active session');

  await page.getByTestId(ids.passwordResetStartButton).click();
  const resetPasswordOtp = await waitForLatestDemoOtp({
    purpose: 'reset-password',
    email
  });
  await expect(page.getByTestId(ids.otpInboxPanel)).toContainText(resetPasswordOtp.data.message.code);
  await page.getByTestId(ids.passwordResetCodeInput).fill(resetPasswordOtp.data.message.code);
  await page.getByTestId(ids.passwordResetNewPasswordInput).fill(newPassword);
  await page.getByTestId(ids.passwordResetSubmitButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('No auth error');
  await expect(page.getByTestId(ids.signInPasswordInput)).toHaveValue(newPassword);

  await page.getByTestId(ids.signInPasswordInput).fill(originalPassword);
  await page.getByTestId(ids.signInSubmitButton).click();
  await expect(page.getByTestId(ids.authErrorPanel)).toContainText('AUTHFN_INVALID_CREDENTIALS');

  await page.getByTestId(ids.signInPasswordInput).fill(newPassword);
  await page.getByTestId(ids.signInSubmitButton).click();
  await expect(page.getByTestId(ids.authStatePanel)).toContainText(email);
});

async function waitForLatestDemoOtp(input: {
  purpose: 'verify-email' | 'sign-in' | 'reset-password';
  email: string;
}) {
  await expect
    .poll(async () => {
      try {
        const latest = await getLatestDemoOtp(serverBaseUrl, input);
        return latest.data.message.code;
      } catch {
        return null;
      }
    })
    .toBe('731942');

  return getLatestDemoOtp(serverBaseUrl, input);
}
