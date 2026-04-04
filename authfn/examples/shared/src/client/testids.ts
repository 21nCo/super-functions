export const EXAMPLE_TEST_IDS = {
  exampleTitle: 'example-title',
  authStatePanel: 'auth-state-panel',
  authErrorPanel: 'auth-error-panel',
  eventLogPanel: 'event-log-panel',
  signUpForm: 'sign-up-form',
  signInForm: 'sign-in-form',
  sessionListPanel: 'session-list-panel',
  signUpEmailInput: 'sign-up-email-input',
  signUpPasswordInput: 'sign-up-password-input',
  signUpSubmitButton: 'sign-up-submit-button',
  signInEmailInput: 'sign-in-email-input',
  signInPasswordInput: 'sign-in-password-input',
  signInSubmitButton: 'sign-in-submit-button',
  refreshSessionButton: 'refresh-session-button',
  listSessionsButton: 'list-sessions-button',
  signOutButton: 'sign-out-button',
  refreshEventsButton: 'refresh-events-button',
  otpInboxPanel: 'otp-inbox-panel',
  verifyEmailSendButton: 'verify-email-send-button',
  verifyEmailCodeInput: 'verify-email-code-input',
  verifyEmailSubmitButton: 'verify-email-submit-button',
  otpSignInSendButton: 'otp-sign-in-send-button',
  otpSignInCodeInput: 'otp-sign-in-code-input',
  otpSignInSubmitButton: 'otp-sign-in-submit-button',
  passwordResetStartButton: 'password-reset-start-button',
  passwordResetCodeInput: 'password-reset-code-input',
  passwordResetNewPasswordInput: 'password-reset-new-password-input',
  passwordResetSubmitButton: 'password-reset-submit-button',
  socialGoogleButton: 'social-google-button',
  socialGithubButton: 'social-github-button',
  socialAppleButton: 'social-apple-button',
  socialDisconnectButton: 'social-disconnect-button',
  socialInvalidRedirectButton: 'social-invalid-redirect-button',
  twoFactorEnrollButton: 'two-factor-enroll-button',
  twoFactorSecretPanel: 'two-factor-secret-panel',
  twoFactorConfirmCodeInput: 'two-factor-confirm-code-input',
  twoFactorConfirmButton: 'two-factor-confirm-button',
  twoFactorChallengeCodeInput: 'two-factor-challenge-code-input',
  twoFactorChallengeButton: 'two-factor-challenge-button',
  twoFactorDisableCodeInput: 'two-factor-disable-code-input',
  twoFactorDisableButton: 'two-factor-disable-button',
  apiKeyNameInput: 'api-key-name-input',
  apiKeyCreateButton: 'api-key-create-button',
  apiKeyListButton: 'api-key-list-button',
  apiKeyListPanel: 'api-key-list-panel',
  apiKeySecretPanel: 'api-key-secret-panel',
  apiKeyProtectedCheckButton: 'api-key-protected-check-button',
  apiKeyProtectedResultPanel: 'api-key-protected-result-panel',
  regionLookupForm: 'region-lookup-form',
  regionLookupIdentifierInput: 'region-lookup-identifier-input',
  regionLookupSubmitButton: 'region-lookup-submit-button',
  regionLookupResultPanel: 'region-lookup-result-panel',
  regionUsRuntimePanel: 'region-us-runtime-panel',
  regionEuRuntimePanel: 'region-eu-runtime-panel',
  regionWrongAuthorityButton: 'region-wrong-authority-button',
  regionCorrectAuthorityButton: 'region-correct-authority-button'
} as const;

export type ExampleTestId = (typeof EXAMPLE_TEST_IDS)[keyof typeof EXAMPLE_TEST_IDS];

const KNOWN_TEST_IDS = new Set<string>(Object.values(EXAMPLE_TEST_IDS));

export function testIdSelector(testId: ExampleTestId): string {
  return `[data-testid="${testId}"]`;
}

export function assertKnownExampleTestId(testId: string): asserts testId is ExampleTestId {
  if (!KNOWN_TEST_IDS.has(testId)) {
    const error = new Error(`Unknown documented authfn example test id: ${testId}`) as Error & {
      code: string;
    };
    error.code = 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING';
    throw error;
  }
}
