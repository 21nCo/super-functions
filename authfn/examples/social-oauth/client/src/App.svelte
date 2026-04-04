<script lang="ts">
  import { onMount } from 'svelte';
  import {
    createAuthFnClient,
    type AuthFnErrorEnvelope,
    type AuthFnSession,
    type AuthFnSuccessEnvelope
  } from '@authfn/client';
  import { EXAMPLE_TEST_IDS } from '@authfn/examples-shared/client/testids';

  type SocialProviderId = 'google' | 'github' | 'apple';
  type SessionEnvelope = AuthFnSuccessEnvelope<{ session: AuthFnSession | null }> | AuthFnErrorEnvelope;
  type SocialStartEnvelope = AuthFnSuccessEnvelope<{
    provider: SocialProviderId;
    redirectTo: string;
    stateId: string;
    expiresAt: string;
  }> | AuthFnErrorEnvelope;
  type DisconnectEnvelope = AuthFnSuccessEnvelope<{
    disconnected: boolean;
    provider: SocialProviderId;
  }> | AuthFnErrorEnvelope;

  const SOCIAL_OAUTH_COOKIE_PREFIX = 'authfn-social-oauth';
  const authBaseUrl = resolveAuthBaseUrl();
  const demoBaseUrl = authBaseUrl.replace(/\/auth$/, '');
  const auth = createAuthFnClient({
    baseUrl: authBaseUrl,
    cookiePrefix: SOCIAL_OAUTH_COOKIE_PREFIX
  });

  let currentSession: AuthFnSession | null = null;
  let authError: AuthFnErrorEnvelope | null = null;
  let eventLog: unknown[] = [];
  let linkedProvider: SocialProviderId | null = null;
  let lastProviderSelection: SocialProviderId | null = null;
  let disconnectedProviders: SocialProviderId[] = [];
  let statusMessage = 'Ready for deterministic local OAuth redirects.';
  let loading = false;

  onMount(async () => {
    const callbackProvider = readProviderFromLocation();
    if (callbackProvider) {
      linkedProvider = callbackProvider;
      lastProviderSelection = callbackProvider;
      statusMessage = `Completed the ${callbackProvider} callback through the local fake provider.`;
    }

    await refreshSessionInternal();
    await refreshEvents();
  });

  async function startSocial(provider: SocialProviderId): Promise<void> {
    await withRequest(async () => {
      const response = await auth.startSocialSignIn({
        provider,
        returnTo: buildReturnTarget(provider)
      }) as SocialStartEnvelope;
      if (!response.ok) {
        authError = response;
        return;
      }

      authError = null;
      disconnectedProviders = disconnectedProviders.filter((value) => value !== provider);
      linkedProvider = provider;
      lastProviderSelection = provider;
      statusMessage = `Redirecting to the local fake ${provider} authorize route.`;
      window.location.assign(buildFakeAuthorizeUrl(provider, response.data.stateId));
    });
  }

  async function triggerDisallowedRedirect(): Promise<void> {
    await withRequest(async () => {
      const response = await auth.startSocialSignIn({
        provider: 'google',
        returnTo: 'https://evil.example.com/callback'
      }) as SocialStartEnvelope;
      if (!response.ok) {
        authError = response;
        statusMessage = 'Captured the canonical disallowed redirect error.';
        return;
      }

      authError = null;
      statusMessage = 'Unexpectedly accepted a disallowed redirect target.';
    });
  }

  async function disconnectLinkedProvider(): Promise<void> {
    const provider = linkedProvider ?? lastProviderSelection;
    if (!provider) {
      statusMessage = 'No linked provider is available to disconnect.';
      return;
    }

    await withRequest(async () => {
      const response = await fetch(`${authBaseUrl}/social/disconnect/${provider}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-authfn-csrf': readCsrfToken()
        }
      });
      const payload = await response.json() as DisconnectEnvelope;
      if (!payload.ok) {
        authError = payload;
        return;
      }

      authError = null;
      disconnectedProviders = [...disconnectedProviders, provider];
      linkedProvider = null;
      lastProviderSelection = provider;
      statusMessage = `Disconnected ${provider} from the current authfn user.`;
      await refreshSessionInternal();
      await refreshEvents();
    });
  }

  async function refreshSession(): Promise<void> {
    await withRequest(async () => {
      await refreshSessionInternal();
      statusMessage = 'Fetched the current browser session.';
    });
  }

  async function refreshEvents(): Promise<void> {
    const response = await fetch(`${demoBaseUrl}/demo/events`, {
      credentials: 'include'
    });
    const payload = await response.json() as AuthFnSuccessEnvelope<{ events: unknown[] }>;
    eventLog = payload.data.events;
  }

  async function refreshEventLog(): Promise<void> {
    await withRequest(async () => {
      await refreshEvents();
      statusMessage = 'Refreshed the example observability log.';
    });
  }

  async function refreshSessionInternal(): Promise<void> {
    const response = await auth.getSession();
    handleSessionEnvelope(response);
  }

  function handleSessionEnvelope(response: SessionEnvelope): void {
    if (!response.ok) {
      authError = response;
      currentSession = null;
      return;
    }

    authError = null;
    currentSession = response.data.session;
    const providerFromSession = deriveProviderFromSession(response.data.session);
    if (providerFromSession && !disconnectedProviders.includes(providerFromSession)) {
      linkedProvider = providerFromSession;
      lastProviderSelection = providerFromSession;
    }
  }

  async function withRequest(action: () => Promise<void>): Promise<void> {
    loading = true;
    try {
      await action();
    } finally {
      loading = false;
    }
  }

  function buildReturnTarget(provider: SocialProviderId): string {
    const url = new URL(window.location.origin);
    url.searchParams.set('provider', provider);
    url.searchParams.set('flow', 'social');
    return url.toString();
  }

  function buildFakeAuthorizeUrl(provider: SocialProviderId, stateId: string): string {
    const url = new URL(`${demoBaseUrl}/demo/fake-oauth/${provider}/authorize`);
    url.searchParams.set('redirect_uri', `${authBaseUrl}/social/callback/${provider}`);
    url.searchParams.set('state', stateId);
    return url.toString();
  }

  function readCsrfToken(): string {
    const cookieName = `${SOCIAL_OAUTH_COOKIE_PREFIX}.csrf`;
    for (const part of document.cookie.split(';')) {
      const [name, ...valueParts] = part.trim().split('=');
      if (name === cookieName) {
        return decodeURIComponent(valueParts.join('='));
      }
    }
    return '';
  }

  function readProviderFromLocation(): SocialProviderId | null {
    const provider = new URL(window.location.href).searchParams.get('provider');
    return isSocialProviderId(provider) ? provider : null;
  }

  function deriveProviderFromSession(session: AuthFnSession | null): SocialProviderId | null {
    const method = session?.methods.find((value) => value.startsWith('oauth-'));
    const provider = method?.replace('oauth-', '');
    return isSocialProviderId(provider) ? provider : null;
  }

  function isSocialProviderId(value: string | null | undefined): value is SocialProviderId {
    return value === 'google' || value === 'github' || value === 'apple';
  }

  function resolveAuthBaseUrl(): string {
    const envValue = import.meta.env.VITE_AUTHFN_BASE_URL;
    return typeof envValue === 'string' && envValue.length > 0
      ? envValue
      : 'http://127.0.0.1:4312/auth';
  }
</script>

<svelte:head>
  <title>AuthFn Social OAuth</title>
</svelte:head>

<div class="shell">
  <section class="hero">
    <p class="eyebrow">authfn example</p>
    <h1 data-testid={EXAMPLE_TEST_IDS.exampleTitle}>Social OAuth</h1>
    <p class="lede">
      A local-only browser example for Google, GitHub, and Apple redirect sign-in using the shared fake provider.
    </p>
    <p class="status">{statusMessage}</p>
  </section>

  <section class="actions-grid">
    <article class="card">
      <h2>Start local OAuth</h2>
      <p class="copy">
        Each button calls <code>/auth/social/start</code>, then redirects into the local fake authorize route with the issued state.
      </p>
      <div class="provider-actions">
        <button
          data-testid={EXAMPLE_TEST_IDS.socialGoogleButton}
          disabled={loading}
          on:click={() => startSocial('google')}
        >
          Continue with Google
        </button>
        <button
          data-testid={EXAMPLE_TEST_IDS.socialGithubButton}
          disabled={loading}
          on:click={() => startSocial('github')}
        >
          Continue with GitHub
        </button>
        <button
          data-testid={EXAMPLE_TEST_IDS.socialAppleButton}
          disabled={loading}
          on:click={() => startSocial('apple')}
        >
          Continue with Apple
        </button>
      </div>
    </article>

    <article class="card">
      <h2>Linked provider</h2>
      <p class="copy">
        Current linked provider: <strong>{linkedProvider ?? 'none'}</strong>
      </p>
      <button
        data-testid={EXAMPLE_TEST_IDS.socialDisconnectButton}
        disabled={loading || !(linkedProvider ?? lastProviderSelection)}
        on:click={disconnectLinkedProvider}
      >
        Disconnect linked provider
      </button>
      <button
        data-testid={EXAMPLE_TEST_IDS.socialInvalidRedirectButton}
        disabled={loading}
        on:click={triggerDisallowedRedirect}
      >
        Trigger disallowed redirect error
      </button>
    </article>
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
        <h2>Auth error</h2>
      </div>
      <pre data-testid={EXAMPLE_TEST_IDS.authErrorPanel}>
{JSON.stringify(authError ?? { message: 'No auth error' }, null, 2)}
      </pre>
    </article>

    <article class="panel card">
      <div class="panel-header">
        <h2>Event log</h2>
        <button data-testid={EXAMPLE_TEST_IDS.refreshEventsButton} disabled={loading} on:click={refreshEventLog}>
          Refresh
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
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(255, 208, 116, 0.2), transparent 34%),
      linear-gradient(180deg, #f8f3ea 0%, #f1ebe3 100%);
    color: #1f2933;
  }

  .shell {
    min-height: 100vh;
    padding: 2.5rem 1.5rem 3rem;
    max-width: 1100px;
    margin: 0 auto;
  }

  .hero {
    margin-bottom: 1.75rem;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.78rem;
    color: #8c4f1f;
    margin-bottom: 0.65rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 5vw, 4rem);
    line-height: 0.95;
    color: #3d2a1c;
  }

  .lede,
  .status,
  .copy {
    max-width: 70ch;
    color: #4a5563;
  }

  .status {
    font-weight: 600;
    color: #8c4f1f;
  }

  .actions-grid,
  .dashboard {
    display: grid;
    gap: 1rem;
  }

  .actions-grid {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    margin-bottom: 1rem;
  }

  .dashboard {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .card {
    background: rgba(255, 255, 255, 0.84);
    border: 1px solid rgba(140, 79, 31, 0.14);
    border-radius: 1.2rem;
    padding: 1.2rem;
    box-shadow: 0 14px 38px rgba(60, 42, 28, 0.08);
    backdrop-filter: blur(8px);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .provider-actions {
    display: grid;
    gap: 0.75rem;
  }

  button {
    appearance: none;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #8c4f1f, #cb6e2c);
    color: white;
    font: inherit;
    padding: 0.8rem 1rem;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
    box-shadow: 0 10px 22px rgba(140, 79, 31, 0.18);
  }

  button:hover:enabled {
    transform: translateY(-1px);
    box-shadow: 0 14px 28px rgba(140, 79, 31, 0.22);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    box-shadow: none;
  }

  pre {
    margin: 0;
    padding: 0.95rem;
    border-radius: 1rem;
    background: rgba(61, 42, 28, 0.06);
    overflow: auto;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  code {
    font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  }

  @media (max-width: 720px) {
    .shell {
      padding: 1.2rem 0.9rem 2rem;
    }
  }
</style>
