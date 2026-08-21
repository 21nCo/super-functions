<script lang="ts">
  import { goto } from '$app/navigation';
  import { ButtonLabel, ButtonRoot, ButtonSpinner } from '@uifn/components-svelte/button';
  import { CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import { InputRoot } from '@uifn/components-svelte/input';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { fetchConsole, setOperatorCsrf } from '$lib/components/admin-api';

  let email = $state('');
  let password = $state('');
  let code = $state('');
  let challengeId = $state<string | undefined>();
  let availableMethods = $state<string[]>([]);
  let submitting = $state(false);
  let message = $state<string | undefined>();

  async function signIn() {
    submitting = true;
    message = undefined;
    try {
      const response = await fetchConsole('/api/admin/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ email, password }) });
      const body = await response.json().catch(() => undefined) as {
        data?: { session?: { csrfCookieName?: string; csrfHeaderName?: string } };
        error?: { code?: string; message?: string; details?: { challengeId?: unknown; availableMethods?: unknown } };
      } | undefined;
      if (!response.ok) {
        const details = body?.error?.details;
        if (body?.error?.code === 'OPERATOR_2FA_REQUIRED' && typeof details?.challengeId === 'string') {
          challengeId = details.challengeId;
          availableMethods = Array.isArray(details.availableMethods)
            ? details.availableMethods.filter((method): method is string => typeof method === 'string')
            : [];
          password = '';
          message = undefined;
          return;
        }
        throw new Error(body?.error?.message ?? 'Authentication failed.');
      }
      setOperatorCsrf(body?.data?.session?.csrfCookieName, body?.data?.session?.csrfHeaderName);
      await goto('/');
    } catch (cause) {
      message = cause instanceof Error ? cause.message : 'Authentication failed.';
    } finally {
      submitting = false;
    }
  }

  async function verifySecondFactor() {
    if (!challengeId) return;
    submitting = true;
    message = undefined;
    try {
      const response = await fetchConsole('/api/admin/v1/auth/2fa', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ challengeId, code }),
      });
      const body = await response.json().catch(() => undefined) as {
        data?: { session?: { csrfCookieName?: string; csrfHeaderName?: string } };
        error?: { message?: string };
      } | undefined;
      if (!response.ok) throw new Error(body?.error?.message ?? 'The verification code was not accepted.');
      setOperatorCsrf(body?.data?.session?.csrfCookieName, body?.data?.session?.csrfHeaderName);
      challengeId = undefined;
      code = '';
      await goto('/');
    } catch (cause) {
      message = cause instanceof Error ? cause.message : 'The verification code was not accepted.';
    } finally {
      submitting = false;
    }
  }

  function backToPassword() {
    challengeId = undefined;
    availableMethods = [];
    code = '';
    password = '';
    message = undefined;
  }
</script>

<PageHeader eyebrow="Operator realm" title="Sign in to Super Console" description="Operator administration is isolated from customer-facing product portals." />
<CardRoot class="sign-in-card" elevated>
  <CardHeader>
    <CardTitle>{challengeId ? 'Verify operator access' : 'Operator access'}</CardTitle>
    <CardDescription>{challengeId ? 'Enter the one-time or recovery code requested by the authentication provider.' : 'Use an identity with an administration role for this self-hosted deployment.'}</CardDescription>
  </CardHeader>
  <CardContent>
    {#if challengeId}
      <form class="sign-in-form" onsubmit={(event) => { event.preventDefault(); void verifySecondFactor(); }}>
        {#if availableMethods.length}<p class="sign-in-form__hint">Available: {availableMethods.join(', ')}</p>{/if}
        <label for="operator-code"><span>Verification or recovery code</span><InputRoot id="operator-code" value={code} oninput={(event: Event) => (code = (event.currentTarget as HTMLInputElement).value)} inputmode="numeric" autocomplete="one-time-code" required autofocus /></label>
        <ButtonRoot type="submit" loading={submitting} disabled={submitting || !code.trim()}><ButtonSpinner /><ButtonLabel>{submitting ? 'Verifying…' : 'Verify and continue'}</ButtonLabel></ButtonRoot>
        <ButtonRoot type="button" variant="ghost" disabled={submitting} onclick={backToPassword}><ButtonLabel>Back to password</ButtonLabel></ButtonRoot>
        {#if message}<p class="sign-in-form__error" role="alert">{message}</p>{/if}
      </form>
    {:else}
      <form class="sign-in-form" onsubmit={(event) => { event.preventDefault(); void signIn(); }}>
        <label for="operator-email"><span>Email</span><InputRoot id="operator-email" value={email} oninput={(event: Event) => (email = (event.currentTarget as HTMLInputElement).value)} type="email" autocomplete="username" required /></label>
        <label for="operator-password"><span>Password</span><InputRoot id="operator-password" value={password} oninput={(event: Event) => (password = (event.currentTarget as HTMLInputElement).value)} type="password" autocomplete="current-password" required /></label>
        <ButtonRoot type="submit" loading={submitting} disabled={submitting}><ButtonSpinner /><ButtonLabel>{submitting ? 'Signing in…' : 'Sign in'}</ButtonLabel></ButtonRoot>
        {#if message}<p class="sign-in-form__error" role="alert">{message}</p>{/if}
      </form>
    {/if}
  </CardContent>
</CardRoot>
