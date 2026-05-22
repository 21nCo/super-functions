---
title: Native mobile handoff
description: Sign in via a system browser, hand the session off to your iOS / Android app as a bearer credential.
---

# Native mobile handoff

## Goal

User taps "Sign in" in your iOS app, sees Apple's `ASWebAuthenticationSession` (or Android's Custom Tabs) with your web sign-in, and lands back in the app **with a bearer credential**, ready to call APIs.

## Plugins

- `authFnSocialOAuthPlugin` with `defaultHandoffMode: 'session-token'`.
- `authFnNativeHandoffPlugin`.

## Flow

```mermaid
sequenceDiagram
  participant App as iOS app
  participant ASWA as ASWebAuthenticationSession
  participant Web as web sign-in (kernel)
  participant Kernel as kernel

  App->>ASWA: open https://app.example.com/sign-in?return=myapp://signed-in
  ASWA->>Web: web sign-in
  Web->>Kernel: POST /handoff/native/start (after sign-in)
  Kernel-->>Web: { code }
  Web-->>ASWA: redirect to myapp://signed-in?code=...
  ASWA-->>App: callback URL
  App->>Kernel: POST /handoff/native/exchange { code }
  Kernel-->>App: { session, sessionToken }
```

## Server config

```ts
authFnSocialOAuthPlugin({
  providers: { google: { /* ... */ } },
  defaultHandoffMode: 'session-token',
});
authFnNativeHandoffPlugin();
```

## Web sign-in page

After successful sign-in, your web app calls:

```ts
const handoff = await client.startNativeHandoff();
if (handoff.ok) {
  window.location.href = `${returnTo}?code=${encodeURIComponent(handoff.data.code)}`;
}
```

`returnTo` is the app's custom URL scheme (`myapp://signed-in`).

## iOS exchange

```swift
let credential = try await client.exchangeNativeHandoff(
    code: handoffCode,
    accountBaseURL: configuration.baseURL,
    device: ["model": UIDevice.current.model]
)
// credential.session, credential.bearerToken
```

Store the bearer token in Keychain. Subsequent requests authenticate with `Authorization: Bearer <token>`.

## Multi-region

If the code was issued by a region different from the one the app first hits, the kernel returns `AUTHFN_REGION_MISMATCH` with `redirectTo`. The regional client retries on the right authority transparently.

## Related

- [Plugins → Native handoff](../plugins/native-handoff)
- [Plugins → Social OAuth → Apple](../plugins/social-oauth/apple)
- [SDKs → Swift](../sdk/swift)
