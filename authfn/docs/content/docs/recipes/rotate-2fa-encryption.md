---
title: Rotating 2FA encryption keys
description: What the shipped two-factor plugin encrypts, and how to change keys without a private crypto API.
---

# Rotating 2FA encryption keys

## What the kernel actually encrypts

TOTP secrets are stored on `authfn_two_factor_enrollments.secret_encrypted`. The two-factor plugin encrypts and decrypts that column with AES-256-GCM, using:

- `pluginRuntime.twoFactor.encryptionKeyResolver(keyRef)` to load a 32-byte key
- `pluginRuntime.twoFactor.encryptionKeyRef` (default `'authfn-2fa'`) as the key identifier passed to the cipher

Those options are **runtime** configuration, not plugin-factory options:

```ts
import { authfn, authFnPlugins } from "authfn";
import { authFnTwoFactorPlugin } from "@authfn/two-factor";

const authApp = authfn({
  plugins: authFnPlugins(authFnTwoFactorPlugin()),
});

const auth = authApp.createServer({
  database,
  pluginRuntime: {
    twoFactor: {
      encryptionKeyRef: "v1",
      encryptionKeyResolver: async (keyRef) => {
        switch (keyRef) {
          case "v1":
            return await loadFromKMS("authfn-2fa-v1");
          default:
            throw new Error(`unknown 2FA key ref: ${keyRef}`);
        }
      },
    },
  },
});
```

There is **no** public `encryptSecret` / `decryptSecret` export, and the enrollment row does **not** store `encryptionKeyRef`. Decrypt always uses the currently configured `encryptionKeyRef`. Changing the ref (or the bytes behind it) without replacing stored ciphertext will make existing enrollments fail to decrypt.

## Supported rotation path: re-enroll

Because the kernel does not expose a re-encrypt helper, the supported public path is:

1. Add the new key material to your secrets store, but keep serving the **old**
   `encryptionKeyRef` while users disable 2FA (`POST /auth/2fa/disable`). Do not
   let users re-enroll during this phase: those rows would still use the old key.
2. Confirm that no active enrollment rows remain. There is no mixed-key state
   because enrollment rows do not store their key reference.
3. Switch `encryptionKeyRef` (and the resolver) to the new identifier.
4. Allow users to enroll again (`POST /auth/2fa/enroll` +
   `POST /auth/2fa/confirm`). Every replacement enrollment now uses the new key.
5. After a grace period, retire the old key from KMS.

```ts
authApp.createServer({
  database,
  pluginRuntime: {
    twoFactor: {
      encryptionKeyRef: "v2",
      encryptionKeyResolver: async (keyRef) => {
        switch (keyRef) {
          case "v2":
            return await loadFromKMS("authfn-2fa-v2");
          default:
            throw new Error(`unknown 2FA key ref: ${keyRef}`);
        }
      },
    },
  },
});
```

Do not switch `encryptionKeyRef` first and then try to decrypt old rows through the plugin — the plugin will use the new ref against ciphertext produced under the old one.

## What not to do

Do not import unpublished kernel internals to decrypt `secret_encrypted`. There is no public re-encrypt helper; operator scripts that unwrap that column directly are outside the public API.

## Related

- [Plugins → Two-factor](../plugins/two-factor)
- [Concepts → Security](../core-concepts/security)
- [SDKs → authfn](../sdk/core)
