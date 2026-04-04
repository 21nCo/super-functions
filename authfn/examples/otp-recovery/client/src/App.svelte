<script lang="ts">
  import { onMount } from 'svelte';
  import { createAuthFnClient, type AuthFnErrorEnvelope, type AuthFnSession, type AuthFnSuccessEnvelope } from '@authfn/client';
  import { EXAMPLE_TEST_IDS } from '@authfn/examples-shared/client/testids';
  import type { ExampleOtpMessage } from '@authfn/examples-shared';

  type OtpPurpose = 'verify-email' | 'sign-in' | 'reset-password';
  type SessionEnvelope = AuthFnSuccessEnvelope<{ session: AuthFnSession | null }> | AuthFnErrorEnvelope;
  type LatestOtpEnvelope = AuthFnSuccessEnvelope<{ message: ExampleOtpMessage }>;

  const OTP_RECOVERY_COOKIE_PREFIX = 'authfn-otp-recovery';
  const authBaseUrl = resolveAuthBaseUrl();
  const demoBaseUrl = authBaseUrl.replace(/\/auth$/, '');
  const auth = createAuthFnClient({
    baseUrl: authBaseUrl,
    cookiePrefix: OTP_RECOVERY_COOKIE_PREFIX
  });

  let signUpEmail = 'ada@example.com';
  let signUpPassword = 'Sup3rSecurePassphrase!';
  let signInEmail = 'ada@example.com';
  let signInPassword = 'Sup3rSecurePassphrase!';
  let verifyEmailCode = '';
  let otpSignInCode = '';
  let resetPasswordCode = '';
  let resetPasswordNewPassword = 'An0therSecurePassphrase!';
  let currentSession: AuthFnSession | null = null;
  let authError: AuthFnErrorEnvelope | null = null;
  let eventLog: unknown[] = [];
  let otpInbox: Partial<Record<OtpPurpose, ExampleOtpMessage>> = {};
  let statusMessage = 'Ready for deterministic OTP and recovery flows.';
  let loading = false;

  onMount(async () => {
    await refreshSessionInternal();
    await refreshEvents();
  });

  async function signUp(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.signUpWithPassword({
        email: signUpEmail,
        password: signUpPassword
      });
      handleSessionEnvelope(response);
      if (!response.ok) {
        return;
      }

      signInEmail = signUpEmail;
      signInPassword = signUpPassword;
      statusMessage = 'Created account for OTP and recovery flows.';
      await refreshEvents();
    });
  }

  async function signIn(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword
      });
      handleSessionEnvelope(response);
      if (!response.ok) {
        return;
      }

      statusMessage = 'Signed in with email/password.';
      await refreshEvents();
    });
  }

  async function sendVerifyEmailOtp(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.sendOtp({
        purpose: 'verify-email',
        email: signUpEmail
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      await refreshLatestOtp('verify-email', signUpEmail);
      statusMessage = 'Sent verify-email OTP to the deterministic demo inbox.';
      await refreshEvents();
    });
  }

  async function verifyEmailOtp(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.verifyOtp({
        purpose: 'verify-email',
        email: signUpEmail,
        code: verifyEmailCode
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      statusMessage = 'Verified the email OTP challenge.';
      await refreshEvents();
    });
  }

  async function sendOtpSignIn(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.sendOtp({
        purpose: 'sign-in',
        email: signInEmail
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      await refreshLatestOtp('sign-in', signInEmail);
      statusMessage = 'Sent OTP sign-in challenge to the deterministic demo inbox.';
      await refreshEvents();
    });
  }

  async function verifyOtpSignIn(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.verifyOtp({
        purpose: 'sign-in',
        email: signInEmail,
        code: otpSignInCode
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      currentSession = 'session' in response.data ? response.data.session : currentSession;
      statusMessage = 'Completed OTP sign-in and issued a browser session.';
      await refreshEvents();
    });
  }

  async function startPasswordReset(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.startPasswordReset({
        email: signInEmail
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      await refreshLatestOtp('reset-password', signInEmail);
      statusMessage = 'Started password reset and loaded the latest reset OTP.';
      await refreshEvents();
    });
  }

  async function completePasswordReset(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.completePasswordReset({
        email: signInEmail,
        code: resetPasswordCode,
        newPassword: resetPasswordNewPassword
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      signInPassword = resetPasswordNewPassword;
      statusMessage = 'Completed password reset with the deterministic inbox OTP.';
      await refreshEvents();
    });
  }

  async function refreshSession(): Promise<void> {
    await withRequest(async () => {
      await refreshSessionInternal();
      statusMessage = 'Fetched the current session.';
    });
  }

  async function signOut(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.signOut();
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      currentSession = null;
      statusMessage = 'Signed out the current browser session.';
      await refreshEvents();
    });
  }

  async function refreshEvents(): Promise<void> {
    const response = await fetch(`${demoBaseUrl}/demo/events`, {
      credentials: 'include'
    });
    const payload = await response.json() as AuthFnSuccessEnvelope<{ events: unknown[] }>;
    eventLog = payload.data.events;
  }

  async function refreshSessionInternal(): Promise<void> {
    const response = await auth.getSession();
    handleSessionEnvelope(response);
  }

  async function refreshLatestOtp(purpose: OtpPurpose, email: string): Promise<void> {
    const url = new URL('/demo/otp/latest', demoBaseUrl);
    url.searchParams.set('purpose', purpose);
    url.searchParams.set('email', email);
    const response = await fetch(url, {
      credentials: 'include'
    });
    const payload = await response.json() as LatestOtpEnvelope | AuthFnErrorEnvelope;
    if (!payload.ok) {
      authError = payload;
      return;
    }

    authError = null;
    otpInbox = {
      ...otpInbox,
      [purpose]: payload.data.message
    };

    if (purpose === 'verify-email') {
      verifyEmailCode = payload.data.message.code;
    } else if (purpose === 'sign-in') {
      otpSignInCode = payload.data.message.code;
    } else {
      resetPasswordCode = payload.data.message.code;
    }
  }

  function handleSessionEnvelope(response: SessionEnvelope): void {
    if (!response.ok) {
      authError = response;
      currentSession = null;
      return;
    }

    authError = null;
    currentSession = response.data.session;
  }

  async function withRequest(action: () => Promise<void>): Promise<void> {
    loading = true;
    try {
      await action();
    } finally {
      loading = false;
    }
  }

  function resolveAuthBaseUrl(): string {
    const envValue = import.meta.env.VITE_AUTHFN_BASE_URL;
    return typeof envValue === 'string' && envValue.length > 0
      ? envValue
      : 'http://127.0.0.1:4311/auth';
  }
</script>

<svelte:head>
  <title>AuthFn OTP Recovery</title>
</svelte:head>

<div class="shell">
  <section class="hero">
    <p class="eyebrow">authfn example</p>
    <h1 data-testid={EXAMPLE_TEST_IDS.exampleTitle}>OTP Recovery</h1>
    <p class="lede">
      Deterministic verify-email OTP, OTP sign-in, and password reset flows backed by the shared demo inbox.
    </p>
    <p class="status">{statusMessage}</p>
  </section>

  <section class="forms">
    <form class="card" data-testid={EXAMPLE_TEST_IDS.signUpForm} on:submit|preventDefault={signUp}>
      <h2>Create account</h2>
      <label>
        <span>Email</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.signUpEmailInput}
          bind:value={signUpEmail}
          autocomplete="email"
          type="email"
        />
      </label>
      <label>
        <span>Password</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.signUpPasswordInput}
          bind:value={signUpPassword}
          autocomplete="new-password"
          type="password"
        />
      </label>
      <button data-testid={EXAMPLE_TEST_IDS.signUpSubmitButton} disabled={loading} type="submit">
        Sign up
      </button>
    </form>

    <form class="card" data-testid={EXAMPLE_TEST_IDS.signInForm} on:submit|preventDefault={signIn}>
      <h2>Sign in with password</h2>
      <label>
        <span>Email</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.signInEmailInput}
          bind:value={signInEmail}
          autocomplete="email"
          type="email"
        />
      </label>
      <label>
        <span>Password</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.signInPasswordInput}
          bind:value={signInPassword}
          autocomplete="current-password"
          type="password"
        />
      </label>
      <button data-testid={EXAMPLE_TEST_IDS.signInSubmitButton} disabled={loading} type="submit">
        Sign in
      </button>
    </form>
  </section>

  <section class="dashboard otp-grid">
    <article class="panel card">
      <div class="panel-header">
        <h2>Current session</h2>
        <div class="actions">
          <button data-testid={EXAMPLE_TEST_IDS.refreshSessionButton} disabled={loading} on:click={refreshSession}>
            Refresh
          </button>
          <button data-testid={EXAMPLE_TEST_IDS.signOutButton} disabled={loading} on:click={signOut}>
            Sign out
          </button>
        </div>
      </div>
      <pre data-testid={EXAMPLE_TEST_IDS.authStatePanel}>
{JSON.stringify(currentSession ?? { message: 'No active session' }, null, 2)}
      </pre>
    </article>

    <article class="panel card">
      <h2>Verify email OTP</h2>
      <p class="hint">Uses `POST /auth/otp/send` and `POST /auth/otp/verify` with `purpose = verify-email`.</p>
      <div class="stack">
        <button data-testid={EXAMPLE_TEST_IDS.verifyEmailSendButton} disabled={loading} on:click={sendVerifyEmailOtp}>
          Send verify-email OTP
        </button>
        <label>
          <span>Code</span>
          <input
            data-testid={EXAMPLE_TEST_IDS.verifyEmailCodeInput}
            bind:value={verifyEmailCode}
            inputmode="numeric"
            type="text"
          />
        </label>
        <button data-testid={EXAMPLE_TEST_IDS.verifyEmailSubmitButton} disabled={loading} on:click={verifyEmailOtp}>
          Verify email OTP
        </button>
      </div>
    </article>

    <article class="panel card">
      <h2>OTP sign-in</h2>
      <p class="hint">Uses the same inbox contract with `purpose = sign-in`.</p>
      <div class="stack">
        <button data-testid={EXAMPLE_TEST_IDS.otpSignInSendButton} disabled={loading} on:click={sendOtpSignIn}>
          Send OTP sign-in code
        </button>
        <label>
          <span>Code</span>
          <input
            data-testid={EXAMPLE_TEST_IDS.otpSignInCodeInput}
            bind:value={otpSignInCode}
            inputmode="numeric"
            type="text"
          />
        </label>
        <button data-testid={EXAMPLE_TEST_IDS.otpSignInSubmitButton} disabled={loading} on:click={verifyOtpSignIn}>
          Complete OTP sign-in
        </button>
      </div>
    </article>

    <article class="panel card">
      <h2>Password reset</h2>
      <p class="hint">Starts reset with password plugin OTP delivery and completes with the latest demo inbox code.</p>
      <div class="stack">
        <button data-testid={EXAMPLE_TEST_IDS.passwordResetStartButton} disabled={loading} on:click={startPasswordReset}>
          Start password reset
        </button>
        <label>
          <span>Code</span>
          <input
            data-testid={EXAMPLE_TEST_IDS.passwordResetCodeInput}
            bind:value={resetPasswordCode}
            inputmode="numeric"
            type="text"
          />
        </label>
        <label>
          <span>New password</span>
          <input
            data-testid={EXAMPLE_TEST_IDS.passwordResetNewPasswordInput}
            bind:value={resetPasswordNewPassword}
            autocomplete="new-password"
            type="password"
          />
        </label>
        <button data-testid={EXAMPLE_TEST_IDS.passwordResetSubmitButton} disabled={loading} on:click={completePasswordReset}>
          Complete password reset
        </button>
      </div>
    </article>

    <article class="panel card">
      <h2>Deterministic inbox</h2>
      <pre data-testid={EXAMPLE_TEST_IDS.otpInboxPanel}>
{JSON.stringify(otpInbox, null, 2)}
      </pre>
    </article>
  </section>

  <section class="dashboard">
    <article class="panel card">
      <h2>Canonical auth envelope</h2>
      <pre data-testid={EXAMPLE_TEST_IDS.authErrorPanel}>
{JSON.stringify(authError ?? { ok: true, message: 'No auth error' }, null, 2)}
      </pre>
    </article>

    <article class="panel card">
      <div class="panel-header">
        <h2>Auth event log</h2>
        <button data-testid={EXAMPLE_TEST_IDS.refreshEventsButton} disabled={loading} on:click={refreshEvents}>
          Refresh events
        </button>
      </div>
      <pre data-testid={EXAMPLE_TEST_IDS.eventLogPanel}>
{JSON.stringify(eventLog, null, 2)}
      </pre>
    </article>
  </section>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: "Avenir Next", "Trebuchet MS", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(107, 167, 125, 0.18), transparent 28%),
      linear-gradient(160deg, #f7f6f1 0%, #e8f0ed 45%, #d7e3f0 100%);
    color: #17212b;
  }

  .shell {
    max-width: 1120px;
    margin: 0 auto;
    padding: 32px 20px 56px;
  }

  .hero {
    margin-bottom: 24px;
  }

  .eyebrow {
    margin: 0 0 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 0.78rem;
    color: #4d6b5b;
  }

  h1, h2 {
    margin: 0;
  }

  .lede,
  .status,
  .hint {
    color: #344658;
  }

  .status {
    margin-top: 12px;
    font-weight: 600;
  }

  .forms,
  .dashboard {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    margin-top: 16px;
  }

  .otp-grid {
    align-items: start;
  }

  .card {
    background: rgba(255, 255, 255, 0.78);
    border: 1px solid rgba(52, 70, 88, 0.12);
    border-radius: 18px;
    padding: 20px;
    box-shadow: 0 18px 42px rgba(23, 33, 43, 0.08);
    backdrop-filter: blur(10px);
  }

  .panel {
    min-height: 100%;
  }

  .panel-header,
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .stack {
    display: grid;
    gap: 12px;
    margin-top: 12px;
  }

  form {
    display: grid;
    gap: 12px;
  }

  label {
    display: grid;
    gap: 6px;
    font-size: 0.92rem;
  }

  input {
    border: 1px solid rgba(52, 70, 88, 0.18);
    border-radius: 12px;
    padding: 12px 14px;
    font: inherit;
    background: rgba(255, 255, 255, 0.95);
  }

  button {
    border: none;
    border-radius: 999px;
    padding: 11px 16px;
    font: inherit;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #2f7b63, #24628f);
    cursor: pointer;
  }

  button[disabled] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  pre {
    overflow: auto;
    background: rgba(23, 33, 43, 0.04);
    border-radius: 14px;
    padding: 14px;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  @media (max-width: 720px) {
    .shell {
      padding: 24px 14px 40px;
    }

    .panel-header,
    .actions {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
