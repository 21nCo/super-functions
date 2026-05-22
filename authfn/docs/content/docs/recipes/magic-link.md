---
title: Magic link sign-in
description: Send a clickable sign-in link instead of asking the user to type a code. Same kernel; different UI.
---

# Magic link sign-in

## Goal

Send the user a link they click to sign in. Underneath, the kernel still uses an OTP — but the email contains a URL with the code embedded.

## Plugins

- `authFnEmailOtpPlugin` (purpose: `'sign-in'`).

## Email template

```text
Subject: Sign in to AcmeApp

Click here: https://app.example.com/sign-in/click?email=ada%40example.com&code=123456
This link expires in 10 minutes.
```

## Click handler (browser)

```svelte
<!-- src/routes/sign-in/click/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { client } from '$lib/client';

  onMount(async () => {
    const url = new URL(window.location.href);
    const email = url.searchParams.get('email');
    const code = url.searchParams.get('code');
    if (!email || !code) return goto('/sign-in');

    const result = await client.verifyOtp({ email, code, purpose: 'sign-in' });
    if (result.ok) goto('/dashboard');
    else goto('/sign-in?error=' + encodeURIComponent(result.error.code));
  });
</script>

<p>Signing you in…</p>
```

## Why a click handler page?

It looks like a `GET` to `/sign-in/click` triggers sign-in, but the actual sign-in happens via a *client-side* `POST` to `/auth/otp/verify`. This:

- preserves CSRF (the kernel never sees a CSRF-fragile `GET` for sign-in),
- sets cookies on the right origin,
- gives you an opportunity to render a "loading" state.

## Account-linking note

If you want OTP sign-in to also work for users who originally signed up with a password, set:

```ts
accountLinking: { otpSignUpExistingUser: true }
```

## Related

- [Plugins → Email OTP](../plugins/email-otp)
- [Concepts → Account linking](../core-concepts/account-linking)
