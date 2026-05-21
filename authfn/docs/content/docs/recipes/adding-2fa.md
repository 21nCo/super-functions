---
title: Adding 2FA
description: Enroll, confirm, and challenge with TOTP — the full UX.
---

# Adding 2FA

## Goal

Let users enroll in TOTP-based 2FA, then enforce it on subsequent sign-ins.

## Plugins

- `authFnTwoFactorPlugin`.

## Enrollment

```ts
const enroll = await client.enableTwoFactor();
if (enroll.ok) {
  // enroll.data.otpauthUri  → render as QR code
  // enroll.data.recoveryCodes → show, ask user to save
}
```

After the user scans the QR with their authenticator app and types a code:

```ts
await client.confirmTwoFactor({ code: '123456' });
```

## Subsequent sign-in

```ts
const r = await client.signInWithPassword({ email, password });
if (!r.ok && r.error.code === 'AUTHFN_2FA_REQUIRED') {
  const code = await ui.askFor2FA();
  await client.completeTwoFactorChallenge({
    challengeId: r.error.details!.challengeId,
    code,
  });
}
```

## Disable

```ts
await client.disableTwoFactor({ code: currentTotpOrRecovery });
```

## Recovery codes

Recovery codes are returned **once** at enrollment. Show them to the user and tell them to save them. Each is single-use; once consumed, prompt the user to regenerate the set.

## Related

- [Plugins → Two-factor](../plugins/two-factor)
- [Examples → account-settings](../examples/account-settings) — full UI.
