---
title: Rotating 2FA encryption keys
description: Move every 2FA enrollment from one key to a new one, with zero user-visible downtime.
---

# Rotating 2FA encryption keys

## Goal

The TOTP secret on `authfn_two_factor_enrollments.secretEncrypted` is encrypted with a key referenced by `encryptionKeyRef`. To rotate keys, you need to **decrypt with the old key, re-encrypt with the new key, update the row** for every enrollment.

## Step 1: add the new key to your secrets store

`encryptionKeyRef` is a string identifier; your `encryptionKeyResolver` maps it to a buffer. Add a new entry:

```ts
encryptionKeyResolver: async (keyRef) => {
  switch (keyRef) {
    case 'v1': return await loadFromKMS('authfn-2fa-v1');
    case 'v2': return await loadFromKMS('authfn-2fa-v2');
    default: throw new Error('unknown key ref');
  }
}
```

## Step 2: run a one-off migration script

```ts
import { decryptSecret, encryptSecret } from '@authfn/core/internal/two-factor-crypto';   // hypothetical

const enrollments = await db.query('select * from authfn_two_factor_enrollments where encryption_key_ref = $1', ['v1']);

for (const e of enrollments) {
  const plaintext = await decryptSecret(e.secret_encrypted, await keyResolver('v1'));
  const reEncrypted = await encryptSecret(plaintext, await keyResolver('v2'));
  await db.query(
    'update authfn_two_factor_enrollments set secret_encrypted = $1, encryption_key_ref = $2 where id = $3',
    [reEncrypted, 'v2', e.id]
  );
}
```

## Step 3: update the runtime

Once every row is on `v2`:

```ts
authFnTwoFactorPlugin({
  encryptionKeyRef: 'v2',
  encryptionKeyResolver,
});
```

## Step 4: retire the old key

After a grace period (long enough for any in-flight backups to roll over), delete the `v1` key from KMS.

## During the rollout

Set the resolver to handle both old and new key refs *simultaneously*. The kernel reads `encryptionKeyRef` from each row and decrypts with the right key. Mid-migration is safe — every row is consistent with itself.

## Related

- [Plugins → Two-factor](../plugins/two-factor)
- [Concepts → Security](../core-concepts/security)
