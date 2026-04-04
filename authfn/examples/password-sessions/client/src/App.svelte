<script lang="ts">
  import { onMount } from 'svelte';
  import { createAuthFnClient, type AuthFnErrorEnvelope, type AuthFnSession, type AuthFnSuccessEnvelope } from '@authfn/client';
  import { EXAMPLE_TEST_IDS } from '@authfn/examples-shared/client/testids';

  type SessionEnvelope = AuthFnSuccessEnvelope<{ session: AuthFnSession | null }> | AuthFnErrorEnvelope;
  const PASSWORD_SESSIONS_COOKIE_PREFIX = 'authfn-password-sessions';

  const authBaseUrl = resolveAuthBaseUrl();
  const demoBaseUrl = authBaseUrl.replace(/\/auth$/, '');
  const auth = createAuthFnClient({
    baseUrl: authBaseUrl,
    cookiePrefix: PASSWORD_SESSIONS_COOKIE_PREFIX
  });

  let signUpEmail = 'ada@example.com';
  let signUpPassword = 'Sup3rSecurePassphrase!';
  let signInEmail = 'ada@example.com';
  let signInPassword = 'Sup3rSecurePassphrase!';
  let currentSession: AuthFnSession | null = null;
  let sessions: AuthFnSession[] = [];
  let currentSessionId: string | undefined;
  let authError: AuthFnErrorEnvelope | null = null;
  let eventLog: unknown[] = [];
  let statusMessage = 'Ready for a deterministic password/session flow.';
  let loading = false;

  onMount(async () => {
    await refreshSessionInternal();
    await refreshEvents();
  });

  async function signUp(): Promise<void> {
    await withRequest('Created account and issued a browser session.', async () => {
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
      await listSessionsInternal();
      await refreshEvents();
    });
  }

  async function signIn(): Promise<void> {
    await withRequest('Signed in with email/password.', async () => {
      const response = await auth.signInWithPassword({
        email: signInEmail,
        password: signInPassword
      });
      handleSessionEnvelope(response);
      if (!response.ok) {
        return;
      }
      await listSessionsInternal();
      await refreshEvents();
    });
  }

  async function refreshSession(): Promise<void> {
    await withRequest('Fetched the current session.', async () => {
      await refreshSessionInternal();
    });
  }

  async function listSessions(): Promise<void> {
    await withRequest('Listed active sessions for the current user.', async () => {
      await listSessionsInternal();
    });
  }

  async function revokeSession(sessionId: string): Promise<void> {
    await withRequest(`Revoked session ${sessionId}.`, async () => {
      const response = await auth.revokeSession({
        sessionId
      });
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      await refreshSessionInternal();
      await listSessionsInternal();
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
      sessions = [];
      currentSessionId = undefined;
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

  async function listSessionsInternal(): Promise<void> {
    const response = await auth.listSessions();
    if (!response.ok) {
      authError = response;
      sessions = [];
      currentSessionId = undefined;
      return;
    }

    authError = null;
    sessions = response.data.sessions;
    currentSessionId = response.data.currentSessionId;
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

  async function withRequest(message: string, action: () => Promise<void>): Promise<void> {
    loading = true;
    try {
      await action();
      statusMessage = message;
    } finally {
      loading = false;
    }
  }

  function sessionLabel(session: AuthFnSession): string {
    return session.id === currentSessionId ? 'Current session' : 'Secondary session';
  }

  function resolveAuthBaseUrl(): string {
    const envValue = import.meta.env.VITE_AUTHFN_BASE_URL;
    return typeof envValue === 'string' && envValue.length > 0
      ? envValue
      : 'http://127.0.0.1:4310/auth';
  }
</script>

<svelte:head>
  <title>AuthFn Password Sessions</title>
</svelte:head>

<div class="shell">
  <section class="hero">
    <p class="eyebrow">authfn example</p>
    <h1 data-testid={EXAMPLE_TEST_IDS.exampleTitle}>Password Sessions</h1>
    <p class="lede">
      A focused browser flow for sign-up, sign-in, cookie session inspection, session revocation,
      and sign-out.
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
        <button data-testid={EXAMPLE_TEST_IDS.refreshSessionButton} disabled={loading} on:click={refreshSession}>
          Refresh
        </button>
      </div>
      <pre data-testid={EXAMPLE_TEST_IDS.authStatePanel}>
{JSON.stringify(currentSession ?? { message: 'No active session' }, null, 2)}
      </pre>
    </article>

    <article class="panel card">
      <div class="panel-header">
        <h2>Session list</h2>
        <div class="actions">
          <button data-testid={EXAMPLE_TEST_IDS.listSessionsButton} disabled={loading} on:click={listSessions}>
            List sessions
          </button>
          <button data-testid={EXAMPLE_TEST_IDS.signOutButton} disabled={loading} on:click={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <ul class="session-list" data-testid={EXAMPLE_TEST_IDS.sessionListPanel}>
        {#if sessions.length === 0}
          <li class="empty">No sessions loaded.</li>
        {:else}
          {#each sessions as session}
            <li class="session-row" data-current={session.id === currentSessionId}>
              <div>
                <strong>{sessionLabel(session)}</strong>
                <p>{session.primaryEmail ?? session.subject.email ?? 'No email on session'}</p>
                <small>{session.id}</small>
              </div>
              {#if session.id === currentSessionId}
                <span class="pill">Current</span>
              {:else}
                <button on:click={() => revokeSession(session.id)}>Revoke session</button>
              {/if}
            </li>
          {/each}
        {/if}
      </ul>
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
      radial-gradient(circle at top left, rgba(242, 200, 76, 0.18), transparent 32%),
      linear-gradient(160deg, #f6f1e7 0%, #e6edf3 52%, #d4e1d5 100%);
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
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 0.78rem;
    color: #8a5a12;
  }

  h1,
  h2 {
    font-family: "Iowan Old Style", "Palatino Linotype", serif;
    margin: 0;
  }

  h1 {
    font-size: clamp(2.6rem, 6vw, 4.4rem);
    line-height: 0.98;
  }

  .lede,
  .status {
    max-width: 720px;
    margin: 12px 0 0;
    font-size: 1.02rem;
    line-height: 1.6;
  }

  .status {
    color: #34536f;
  }

  .forms,
  .dashboard {
    display: grid;
    gap: 18px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    margin-top: 18px;
  }

  .card {
    padding: 20px;
    border: 1px solid rgba(23, 33, 43, 0.09);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 40px rgba(46, 64, 86, 0.08);
  }

  label {
    display: grid;
    gap: 6px;
    margin-top: 14px;
    font-size: 0.95rem;
  }

  input,
  button {
    font: inherit;
  }

  input {
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(23, 33, 43, 0.16);
    background: rgba(255, 255, 255, 0.88);
  }

  button {
    margin-top: 14px;
    border: none;
    border-radius: 999px;
    padding: 11px 16px;
    background: linear-gradient(135deg, #0e5f76 0%, #27827b 100%);
    color: #fdfcf7;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .panel-header,
  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  pre {
    margin: 14px 0 0;
    padding: 14px;
    border-radius: 18px;
    background: #17212b;
    color: #ecf6ff;
    font-size: 0.84rem;
    line-height: 1.45;
    overflow: auto;
    min-height: 180px;
  }

  .session-list {
    list-style: none;
    padding: 0;
    margin: 14px 0 0;
    display: grid;
    gap: 12px;
  }

  .session-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 14px;
    border-radius: 18px;
    background: rgba(13, 89, 114, 0.08);
  }

  .session-row p,
  .session-row small {
    margin: 4px 0 0;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 8px 12px;
    background: #f0b448;
    color: #3f2400;
    font-weight: 600;
  }

  .empty {
    padding: 10px 2px;
    color: #5f7282;
  }

  @media (max-width: 640px) {
    .shell {
      padding: 24px 16px 44px;
    }

    .card {
      border-radius: 20px;
    }
  }
</style>
