<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createAuthFnClient,
    type AuthFnApiKeyRecord,
    type AuthFnErrorEnvelope,
    type AuthFnSession,
    type AuthFnSuccessEnvelope
  } from '@authfn/client';
  import { EXAMPLE_TEST_IDS } from '@authfn/examples-shared/client/testids';

  type SessionEnvelope = AuthFnSuccessEnvelope<{ session: AuthFnSession | null }> | AuthFnErrorEnvelope;
  const ACCOUNT_SETTINGS_COOKIE_PREFIX = 'authfn-account-settings';

  const authBaseUrl = resolveAuthBaseUrl();
  const demoBaseUrl = authBaseUrl.replace(/\/auth$/, '');
  const auth = createAuthFnClient({
    baseUrl: authBaseUrl,
    cookiePrefix: ACCOUNT_SETTINGS_COOKIE_PREFIX
  });

  let signUpEmail = 'ada@example.com';
  let signUpPassword = 'Sup3rSecurePassphrase!';
  let signInEmail = 'ada@example.com';
  let signInPassword = 'Sup3rSecurePassphrase!';
  let confirmCode = '';
  let challengeCode = '';
  let disableCode = '';
  let apiKeyName = 'playwright';

  let currentSession: AuthFnSession | null = null;
  let authError: AuthFnErrorEnvelope | null = null;
  let eventLog: unknown[] = [];
  let apiKeys: AuthFnApiKeyRecord[] = [];
  let latestApiKeySecret = '';
  let protectedResult: unknown = { message: 'No protected API-key call yet.' };
  let enrollmentSecret = '';
  let recoveryCodes: string[] = [];
  let challengeId = '';
  let statusMessage = 'Ready for deterministic account settings flows.';
  let loading = false;

  onMount(async () => {
    await refreshSessionInternal();
    await refreshEvents();
  });

  async function signUp(): Promise<void> {
    await withRequest('Created an account and entered the settings surface.', async () => {
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
      await listApiKeysInternal();
      await refreshEvents();
    });
  }

  async function signIn(): Promise<void> {
    await withRequest('Attempted password sign-in for the settings surface.', async () => {
      const response = await auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword
      });
      handleSessionEnvelope(response);
      if (!response.ok) {
        challengeId = readChallengeId(response);
        return;
      }

      challengeId = '';
      await listApiKeysInternal();
      await refreshEvents();
    });
  }

  async function signOut(): Promise<void> {
    await withRequest('Signed out the current browser session.', async () => {
      const response = await auth.signOut();
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      currentSession = null;
      apiKeys = [];
      challengeId = '';
      await refreshEvents();
    });
  }

  async function refreshSession(): Promise<void> {
    await withRequest('Fetched the current browser session.', async () => {
      await refreshSessionInternal();
    });
  }

  async function enrollTwoFactor(): Promise<void> {
    await withRequest('Started 2FA enrollment and revealed the deterministic shared secret.', async () => {
      const response = await auth.enableTwoFactor();
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      enrollmentSecret = response.data.secret;
      recoveryCodes = response.data.recoveryCodes;
      confirmCode = '';
      disableCode = '';
      await refreshEvents();
    });
  }

  async function confirmTwoFactor(): Promise<void> {
    await withRequest('Confirmed 2FA enrollment with a valid TOTP code.', async () => {
      const response = await auth.confirmTwoFactor({
        code: confirmCode
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      await refreshSessionInternal();
      await refreshEvents();
    });
  }

  async function completeTwoFactorChallenge(): Promise<void> {
    await withRequest('Completed the pending 2FA challenge.', async () => {
      const response = await auth.completeTwoFactorChallenge({
        challengeId,
        code: challengeCode
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      challengeId = '';
      challengeCode = '';
      currentSession = response.data.session;
      await listApiKeysInternal();
      await refreshEvents();
    });
  }

  async function disableTwoFactor(): Promise<void> {
    await withRequest('Disabled 2FA with a valid TOTP code.', async () => {
      const response = await auth.disableTwoFactor({
        code: disableCode
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      enrollmentSecret = '';
      recoveryCodes = [];
      disableCode = '';
      await refreshEvents();
    });
  }

  async function createApiKey(): Promise<void> {
    await withRequest('Created an API key for deterministic bearer checks.', async () => {
      const response = await auth.createApiKey({
        name: apiKeyName,
        scopes: ['read']
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      latestApiKeySecret = response.data.secret;
      await listApiKeysInternal();
      await refreshEvents();
    });
  }

  async function listApiKeys(): Promise<void> {
    await withRequest('Listed API keys for the current user.', async () => {
      await listApiKeysInternal();
    });
  }

  async function revokeApiKey(keyId: string): Promise<void> {
    await withRequest(`Revoked API key ${keyId}.`, async () => {
      const response = await auth.revokeApiKey({
        keyId
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      await listApiKeysInternal();
      await refreshEvents();
    });
  }

  async function callProtectedEndpoint(): Promise<void> {
    await withRequest('Called the protected demo endpoint with the latest API key secret.', async () => {
      const response = await fetch(`${demoBaseUrl}/demo/api-key/protected`, {
        credentials: 'include',
        headers: {
          authorization: `Bearer ${latestApiKeySecret}`
        }
      });
      protectedResult = await response.json();
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

  async function listApiKeysInternal(): Promise<void> {
    const response = await auth.listApiKeys();
    if (!response.ok) {
      authError = response;
      apiKeys = [];
      return;
    }

    authError = null;
    apiKeys = response.data.keys;
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

  function readChallengeId(response: AuthFnErrorEnvelope): string {
    const challengeValue = response.error.details?.challengeId;
    return typeof challengeValue === 'string' ? challengeValue : '';
  }

  async function withRequest(message: string, action: () => Promise<void>): Promise<void> {
    loading = true;
    try {
      await action();
      statusMessage = message;
    } finally {
      loading = false;
    }
  }

  function resolveAuthBaseUrl(): string {
    const envValue = import.meta.env.VITE_AUTHFN_BASE_URL;
    return typeof envValue === 'string' && envValue.length > 0
      ? envValue
      : 'http://127.0.0.1:4313/auth';
  }
</script>

<svelte:head>
  <title>AuthFn Account Settings</title>
</svelte:head>

<div class="shell">
  <section class="hero">
    <p class="eyebrow">authfn example</p>
    <h1 data-testid={EXAMPLE_TEST_IDS.exampleTitle}>Account Settings</h1>
    <p class="lede">
      A focused browser flow for post-login API-key management and two-factor authentication.
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
      <h2>Sign in</h2>
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

  <section class="dashboard">
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
      <div class="panel-header">
        <h2>Canonical auth envelope</h2>
      </div>
      <pre data-testid={EXAMPLE_TEST_IDS.authErrorPanel}>
{JSON.stringify(authError ?? { ok: true, message: 'No auth error' }, null, 2)}
      </pre>
    </article>
  </section>

  <section class="dashboard">
    <article class="panel card">
      <div class="panel-header">
        <h2>Two-factor management</h2>
        <button data-testid={EXAMPLE_TEST_IDS.twoFactorEnrollButton} disabled={loading} on:click={enrollTwoFactor}>
          Enroll 2FA
        </button>
      </div>

      <div class="field">
        <span>Shared secret</span>
        <pre data-testid={EXAMPLE_TEST_IDS.twoFactorSecretPanel}>
{enrollmentSecret || 'No 2FA enrollment generated yet.'}
        </pre>
      </div>

      <label>
        <span>Confirm code</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.twoFactorConfirmCodeInput}
          bind:value={confirmCode}
          inputmode="numeric"
          placeholder="123456"
          type="text"
        />
      </label>
      <button
        data-testid={EXAMPLE_TEST_IDS.twoFactorConfirmButton}
        disabled={loading || !enrollmentSecret}
        on:click={confirmTwoFactor}
      >
        Confirm 2FA
      </button>

      <div class="field">
        <span>Pending challenge ID</span>
        <code>{challengeId || 'No pending challenge'}</code>
      </div>
      <label>
        <span>Challenge code</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.twoFactorChallengeCodeInput}
          bind:value={challengeCode}
          inputmode="numeric"
          placeholder="123456"
          type="text"
        />
      </label>
      <button
        data-testid={EXAMPLE_TEST_IDS.twoFactorChallengeButton}
        disabled={loading || !challengeId}
        on:click={completeTwoFactorChallenge}
      >
        Complete 2FA challenge
      </button>

      <label>
        <span>Disable code</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.twoFactorDisableCodeInput}
          bind:value={disableCode}
          inputmode="numeric"
          placeholder="123456"
          type="text"
        />
      </label>
      <button
        data-testid={EXAMPLE_TEST_IDS.twoFactorDisableButton}
        disabled={loading || !enrollmentSecret}
        on:click={disableTwoFactor}
      >
        Disable 2FA
      </button>

      <p class="hint">
        Recovery codes: {recoveryCodes.length > 0 ? recoveryCodes.join(', ') : 'Not issued yet.'}
      </p>
    </article>

    <article class="panel card">
      <div class="panel-header">
        <h2>API keys</h2>
        <div class="actions">
          <button data-testid={EXAMPLE_TEST_IDS.apiKeyListButton} disabled={loading} on:click={listApiKeys}>
            List keys
          </button>
          <button
            data-testid={EXAMPLE_TEST_IDS.apiKeyProtectedCheckButton}
            disabled={loading || !latestApiKeySecret}
            on:click={callProtectedEndpoint}
          >
            Call protected endpoint
          </button>
        </div>
      </div>

      <label>
        <span>Key name</span>
        <input
          data-testid={EXAMPLE_TEST_IDS.apiKeyNameInput}
          bind:value={apiKeyName}
          placeholder="playwright"
          type="text"
        />
      </label>
      <button
        data-testid={EXAMPLE_TEST_IDS.apiKeyCreateButton}
        disabled={loading}
        on:click={createApiKey}
      >
        Create API key
      </button>

      <div class="field">
        <span>Latest secret</span>
        <pre data-testid={EXAMPLE_TEST_IDS.apiKeySecretPanel}>
{latestApiKeySecret || 'No API key issued yet.'}
        </pre>
      </div>

      <ul class="api-key-list" data-testid={EXAMPLE_TEST_IDS.apiKeyListPanel}>
        {#if apiKeys.length === 0}
          <li class="empty">No API keys loaded.</li>
        {:else}
          {#each apiKeys as apiKey}
            <li class="api-key-row">
              <div>
                <strong>{apiKey.name ?? 'api-key'}</strong>
                <p>{(apiKey.scopes ?? []).join(', ') || 'No scopes'}</p>
                <small>{apiKey.id}</small>
              </div>
              <button on:click={() => revokeApiKey(apiKey.id)}>Revoke API key</button>
            </li>
          {/each}
        {/if}
      </ul>

      <pre data-testid={EXAMPLE_TEST_IDS.apiKeyProtectedResultPanel}>
{JSON.stringify(protectedResult, null, 2)}
      </pre>
    </article>
  </section>

  <section class="dashboard">
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
      radial-gradient(circle at top left, rgba(91, 166, 156, 0.18), transparent 30%),
      linear-gradient(160deg, #f1f2e9 0%, #dfeaf1 48%, #ebe2d1 100%);
    color: #16232e;
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
    margin: 0 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.78rem;
    color: #45636f;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.6rem, 4vw, 4rem);
  }

  .lede,
  .status,
  .hint {
    color: #35515d;
  }

  .forms,
  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }

  .card {
    background: rgba(255, 255, 255, 0.84);
    border: 1px solid rgba(46, 85, 96, 0.12);
    border-radius: 22px;
    padding: 20px;
    box-shadow: 0 18px 48px rgba(30, 54, 63, 0.08);
    backdrop-filter: blur(10px);
  }

  .panel {
    min-height: 100%;
  }

  .panel-header,
  .actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  form,
  .panel {
    display: grid;
    gap: 12px;
  }

  label,
  .field {
    display: grid;
    gap: 6px;
    font-weight: 600;
  }

  input,
  button {
    font: inherit;
  }

  input {
    border: 1px solid rgba(57, 89, 99, 0.22);
    border-radius: 14px;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.9);
  }

  button {
    border: none;
    border-radius: 999px;
    padding: 11px 16px;
    background: #194e59;
    color: #f7fbfc;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  pre,
  code {
    border-radius: 16px;
    background: rgba(16, 36, 44, 0.94);
    color: #d8f1f3;
    padding: 14px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .api-key-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 10px;
  }

  .api-key-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    border: 1px solid rgba(57, 89, 99, 0.12);
    border-radius: 16px;
    padding: 12px;
    background: rgba(247, 250, 251, 0.9);
  }

  .api-key-row p,
  .api-key-row small {
    margin: 2px 0 0;
  }

  .empty {
    color: #5a6e79;
  }

  @media (max-width: 700px) {
    .shell {
      padding: 20px 14px 40px;
    }

    .api-key-row {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
