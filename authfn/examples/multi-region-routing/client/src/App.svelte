<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createAuthFnClient,
    type AuthFnErrorEnvelope,
    type AuthFnEnvironment,
    type AuthFnSession,
    type AuthFnSuccessEnvelope,
    type AuthFnRegionLookupResult
  } from '@authfn/client';
  import { EXAMPLE_TEST_IDS } from '@authfn/examples-shared/client/testids';

  type SessionEnvelope = AuthFnSuccessEnvelope<{ session: AuthFnSession | null }> | AuthFnErrorEnvelope;
  type RuntimeEnvelope = AuthFnSuccessEnvelope<AuthFnEnvironment> | AuthFnErrorEnvelope;
  type LookupEnvelope = AuthFnSuccessEnvelope<AuthFnRegionLookupResult> | AuthFnErrorEnvelope;

  const usAuth = createAuthFnClient({
    baseUrl: 'http://127.0.0.1:4315/auth',
    cookiePrefix: 'authfn-us'
  });
  const euAuth = createAuthFnClient({
    baseUrl: 'http://localhost:4316/auth',
    cookiePrefix: 'authfn-eu'
  });
  const demoBaseUrl = 'http://127.0.0.1:4315';

  let identifier = 'ada@example.com';
  let password = 'Sup3rSecurePassphrase!';
  let runtimeUs: AuthFnEnvironment | null = null;
  let runtimeEu: AuthFnEnvironment | null = null;
  let lookupResult: AuthFnRegionLookupResult | null = null;
  let sessions: { us: AuthFnSession | null; eu: AuthFnSession | null } = { us: null, eu: null };
  let authError: AuthFnErrorEnvelope | null = null;
  let eventLog: unknown[] = [];
  let statusMessage = 'Ready to inspect routing across two local authorities.';
  let loading = false;

  onMount(async () => {
    await refreshRuntimes();
    await refreshSessions();
    await refreshEvents();
  });

  async function refreshRuntimes(): Promise<void> {
    await withRequest('Loaded runtime overrides for both authorities.', async () => {
      const [usRuntime, euRuntime] = await Promise.all([usAuth.getEnvironment(), euAuth.getEnvironment()]);
      handleRuntimeEnvelope('us', usRuntime);
      handleRuntimeEnvelope('eu', euRuntime);
    });
  }

  async function lookupRegion(): Promise<void> {
    await withRequest('Looked up authority guidance for the identifier on the US authority.', async () => {
      const response = await usAuth.lookupRegion({
        identifier
      }) as LookupEnvelope;
      if (!response.ok) {
        authError = response;
        lookupResult = null;
        return;
      }

      authError = null;
      lookupResult = response.data;
      await refreshEvents();
    });
  }

  async function signInWrongAuthority(): Promise<void> {
    await withRequest('Tried the wrong authority and captured canonical redirect guidance.', async () => {
      const response = await usAuth.signInWithPassword({
        email: identifier,
        password
      });
      handleSessionEnvelope('us', response);
      await refreshEvents();
    });
  }

  async function signInCorrectAuthority(): Promise<void> {
    await withRequest('Signed in on the correct authority after lookup guidance.', async () => {
      const response = await euAuth.signInWithPassword({
        email: identifier,
        password
      });
      handleSessionEnvelope('eu', response);
      if (!response.ok) {
        return;
      }

      await refreshSessions();
      await refreshEvents();
    });
  }

  async function refreshSessions(): Promise<void> {
    const [usSession, euSession] = await Promise.all([usAuth.getSession(), euAuth.getSession()]);
    applySessionEnvelope('us', usSession);
    applySessionEnvelope('eu', euSession);
  }

  async function refreshEvents(): Promise<void> {
    const response = await fetch(`${demoBaseUrl}/demo/events`, {
      credentials: 'include'
    });
    const payload = await response.json() as AuthFnSuccessEnvelope<{ events: unknown[] }>;
    eventLog = payload.data.events;
  }

  function handleRuntimeEnvelope(authority: 'us' | 'eu', response: RuntimeEnvelope): void {
    if (!response.ok) {
      authError = response;
      if (authority === 'us') {
        runtimeUs = null;
      } else {
        runtimeEu = null;
      }
      return;
    }

    authError = null;
    if (authority === 'us') {
      runtimeUs = response.data;
    } else {
      runtimeEu = response.data;
    }
  }

  function handleSessionEnvelope(authority: 'us' | 'eu', response: SessionEnvelope): void {
    applySessionEnvelope(authority, response);
    if (!response.ok) {
      authError = response;
      return;
    }

    authError = null;
  }

  function applySessionEnvelope(authority: 'us' | 'eu', response: SessionEnvelope): void {
    if (!response.ok) {
      sessions = {
        ...sessions,
        [authority]: null
      };
      return;
    }

    sessions = {
      ...sessions,
      [authority]: response.data.session
    };
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
</script>

<svelte:head>
  <title>AuthFn Multi-Region Routing</title>
</svelte:head>

<div class="shell">
  <section class="hero">
    <p class="eyebrow">authfn example</p>
    <h1 data-testid={EXAMPLE_TEST_IDS.exampleTitle}>Multi-Region Routing</h1>
    <p class="lede">
      A two-authority local demo for identifier lookup, wrong-authority rejection, and correct-authority continuation.
    </p>
    <p class="status">{statusMessage}</p>
  </section>

  <section class="dashboard">
    <article class="panel card">
      <div class="panel-header">
        <h2>Lookup</h2>
        <button disabled={loading} on:click={refreshRuntimes}>Refresh runtimes</button>
      </div>

      <form data-testid={EXAMPLE_TEST_IDS.regionLookupForm} on:submit|preventDefault={lookupRegion}>
        <label>
          <span>Identifier</span>
          <input
            data-testid={EXAMPLE_TEST_IDS.regionLookupIdentifierInput}
            bind:value={identifier}
            autocomplete="email"
            type="email"
          />
        </label>
        <button data-testid={EXAMPLE_TEST_IDS.regionLookupSubmitButton} disabled={loading} type="submit">
          Lookup region
        </button>
      </form>

      <pre data-testid={EXAMPLE_TEST_IDS.regionLookupResultPanel}>
{JSON.stringify(lookupResult ?? { message: 'No lookup performed yet.' }, null, 2)}
      </pre>
    </article>

    <article class="panel card">
      <h2>Authority actions</h2>
      <label>
        <span>Password</span>
        <input bind:value={password} autocomplete="current-password" type="password" />
      </label>
      <div class="actions">
        <button
          data-testid={EXAMPLE_TEST_IDS.regionWrongAuthorityButton}
          disabled={loading}
          on:click={signInWrongAuthority}
        >
          Sign in on US authority
        </button>
        <button
          data-testid={EXAMPLE_TEST_IDS.regionCorrectAuthorityButton}
          disabled={loading}
          on:click={signInCorrectAuthority}
        >
          Sign in on EU authority
        </button>
      </div>
      <pre data-testid={EXAMPLE_TEST_IDS.authErrorPanel}>
{JSON.stringify(authError ?? { ok: true, message: 'No auth error' }, null, 2)}
      </pre>
      <pre data-testid={EXAMPLE_TEST_IDS.authStatePanel}>
{JSON.stringify(sessions, null, 2)}
      </pre>
    </article>
  </section>

  <section class="dashboard">
    <article class="panel card">
      <h2>US runtime</h2>
      <pre data-testid={EXAMPLE_TEST_IDS.regionUsRuntimePanel}>
{JSON.stringify(runtimeUs ?? { message: 'US runtime unavailable' }, null, 2)}
      </pre>
    </article>

    <article class="panel card">
      <h2>EU runtime</h2>
      <pre data-testid={EXAMPLE_TEST_IDS.regionEuRuntimePanel}>
{JSON.stringify(runtimeEu ?? { message: 'EU runtime unavailable' }, null, 2)}
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
      radial-gradient(circle at top left, rgba(61, 117, 190, 0.16), transparent 30%),
      radial-gradient(circle at bottom right, rgba(206, 167, 62, 0.16), transparent 35%),
      linear-gradient(160deg, #f2f1ea 0%, #dbe5ef 45%, #ebe0d3 100%);
    color: #18242d;
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
  .status {
    color: #36505b;
  }

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
    display: grid;
    gap: 12px;
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
  label {
    display: grid;
    gap: 6px;
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
    background: #1f5062;
    color: #f7fbfc;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  pre {
    border-radius: 16px;
    background: rgba(16, 36, 44, 0.94);
    color: #d8f1f3;
    padding: 14px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (max-width: 700px) {
    .shell {
      padding: 20px 14px 40px;
    }
  }
</style>
