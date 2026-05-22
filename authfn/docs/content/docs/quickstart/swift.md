---
title: Swift (iOS / macOS)
description: Sign into authfn from a SwiftUI app using bearer tokens, native Apple Sign-In, and web ↔ native handoff.
---

# Swift quickstart

`AuthFnSwift` is the Swift Package Manager distribution of the authfn client. It speaks bearer tokens (no cookies), supports native Sign in with Apple, and ships a web → native handoff flow for apps that wrap a web sign-in.

## 1. Add the package

Add to your `Package.swift`:

```swift
.package(url: "https://github.com/21nCo/super-functions.git", from: "0.1.0"),
```

…and depend on the products you need:

```swift
.product(name: "AuthFnClient", package: "super-functions"),
.product(name: "AuthFnSwiftUI", package: "super-functions"), // optional, SwiftUI helpers
.product(name: "AuthFnWebViewBridgeHost", package: "super-functions"), // optional, web handoff
```

## 2. Create a client

```swift
import AuthFnClient

let client = AuthFnClient(
    configuration: AuthFnConfiguration(
        baseURL: URL(string: "https://api.example.com/auth")!,
        defaultRegionId: "us-east-1",
        cookiePrefix: "authfn"
    )
)
```

## 3. Sign in with email and password

```swift
let credential = try await client.signInWithPassword(
    email: "ada@example.com",
    password: "correct horse battery staple"
)
print("Signed in as \(credential.session.primaryEmail ?? "?")")
```

The `AuthFnClient` automatically stores the bearer token in a `AuthFnCredentialStore` you can swap (the default is in-memory; supply a Keychain-backed store for production).

## 4. Use the SwiftUI session model

```swift
import SwiftUI
import AuthFnClient
import AuthFnSwiftUI

@MainActor
struct ContentView: View {
    @StateObject private var session = AuthFnSessionModel(client: client)

    var body: some View {
        if let credential = session.credential {
            Text("Signed in as \(credential.session.primaryEmail ?? "?")")
        } else {
            Button("Sign in") {
                Task { try await session.signInWithPassword(email: "ada@example.com", password: "...") }
            }
        }
    }
}
```

## 5. Native Apple Sign-In

`AuthFnSwift` integrates with `ASAuthorizationAppleIDProvider` so you can keep the native flow without redirecting through a web view:

```swift
let start = try await client.startNativeAppleSignIn(
    accountBaseURL: configuration.baseURL,
    returnTo: "myapp://signed-in",
    handoffMode: "session-token"
)

// Run the AuthorizationController flow with start.nonce, etc.
// On success:
let result = try await client.completeNativeAppleSignIn(
    accountBaseURL: configuration.baseURL,
    stateId: start.stateId,
    identityToken: identityToken,
    authorizationCode: authorizationCode,
    user: nil
)
```

## 6. Web → native handoff

When users sign in inside a web view, exchange the handoff code for a native bearer credential:

```swift
let credential = try await client.exchangeNativeHandoff(
    code: handoffCode,
    accountBaseURL: configuration.baseURL,
    device: ["model": UIDevice.current.model]
)
```

The web view itself can be hosted by `AuthFnWebViewBridgeHost`, which posts the handoff code back to the host app via `WKScriptMessageHandler`.

## Next steps

- [SDKs → Swift](../sdk/swift) for the full Swift API reference.
- [Plugins → Native handoff](../plugins/native-handoff) for the server-side configuration.
- [Recipes → Native mobile handoff](../recipes/native-mobile-handoff) for an end-to-end walkthrough.
