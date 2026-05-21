---
title: Swift SDK (AuthFnSwift)
description: The Swift package for iOS / macOS — bearer-token sessions, native Sign in with Apple, web→native handoff, and SwiftUI helpers.
---

# AuthFnSwift

`AuthFnSwift` is the Swift Package Manager distribution of the authfn client. It targets:

- **iOS** ≥ 16, **macOS** ≥ 13, **iPadOS**, **tvOS** ≥ 16.
- **Bearer-token sessions** by default (cookies aren't well-suited for Apple platforms).
- **Native Apple Sign-In** via `AuthenticationServices`.
- **Web → native handoff** with two host modes.

```swift
.package(url: "https://github.com/21nCo/super-functions.git", from: "0.1.0"),
```

Products:

- `AuthFnClient` — the core client. Talks to a remote authfn kernel.
- `AuthFnSwiftUI` — `@MainActor` `ObservableObject`s for SwiftUI binding.
- `AuthFnWebViewBridgeHost` — `WKScriptMessageHandler` that bridges a hosted web view to native handoff.

## AuthFnClient

```swift
import AuthFnClient

let client = AuthFnClient(
    configuration: AuthFnConfiguration(
        baseURL: URL(string: "https://api.example.com/auth")!,
        defaultRegionId: "us-east-1",
        cookiePrefix: "authfn",
        urlSession: .shared
    ),
    credentialStore: KeychainCredentialStore()    // or AuthFnInMemoryCredentialStore
)
```

The credential store implements:

```swift
public protocol AuthFnCredentialStore {
    func getCredential() async throws -> AuthFnCredential?
    func setCredential(_ credential: AuthFnCredential?) async throws
}

public struct AuthFnCredential: Codable, Sendable {
    public let session: AuthFnSession
    public let bearerToken: String
}
```

The default `AuthFnInMemoryCredentialStore` is fine for development. For production, ship your own keychain-backed implementation.

## API surface

The client mirrors `@authfn/client`:

```swift
let credential = try await client.signInWithPassword(email: "ada@example.com", password: "...")
let me = try await client.getSession()
let sessions = try await client.listSessions()
try await client.signOut()

let otp = try await client.sendOtp(purpose: .signIn, email: "ada@example.com")
let after = try await client.verifyOtp(purpose: .signIn, email: "ada@example.com", code: "123456")

let key = try await client.createApiKey(name: "iOS app", scopes: ["repo:read"])

try await client.enableTwoFactor()
try await client.confirmTwoFactor(code: "123456")
try await client.completeTwoFactorChallenge(challengeId: id, code: "654321")

let region = try await client.lookupRegion(identifier: "ada@eu.com")
let runtime = try await client.getRuntime()
```

Error handling: throwing methods raise `AuthFnError` which carries `code`, `message`, `retryable`, `details`. The `code` is one of the `AuthFnErrorCode` enum cases (matching the wire codes).

## Native Sign in with Apple

```swift
let start = try await client.startNativeAppleSignIn(
    accountBaseURL: configuration.baseURL,
    returnTo: "myapp://signed-in",
    handoffMode: "session-token"
)

// run ASAuthorizationController with start.nonce
// on success:

let credential = try await client.completeNativeAppleSignIn(
    accountBaseURL: configuration.baseURL,
    stateId: start.stateId,
    identityToken: appleIDCredential.identityToken!,
    authorizationCode: appleIDCredential.authorizationCode!,
    user: appleIDCredential.user            // first-time only
)
```

The `AuthFnAppleSignInCoordinator` (in `AuthFnSwiftUI`) wraps this in a single call.

## Web → native handoff

When your app hosts an `ASWebAuthenticationSession` for sign-in, configure your authfn server with `defaultHandoffMode: 'session-token'`. The callback redirects to `myapp://signed-in?code=<handoff-code>`. Exchange that code for a credential:

```swift
let credential = try await client.exchangeNativeHandoff(
    code: handoffCode,
    accountBaseURL: configuration.baseURL,
    device: ["model": UIDevice.current.model]
)
```

For a `WKWebView`-hosted sign-in, install `AuthFnWebViewBridge`:

```swift
import AuthFnWebViewBridgeHost

let bridge = AuthFnWebViewBridge(client: client, accountBaseURL: configuration.baseURL)
bridge.attach(to: webView)
```

The bridge listens for `postMessage` from the web side, exchanges the code, and updates `client.credentialStore`.

## SwiftUI integration

```swift
import AuthFnSwiftUI

@MainActor
struct ContentView: View {
    @StateObject private var session = AuthFnSessionModel(client: client)

    var body: some View {
        if let credential = session.credential {
            AuthenticatedView(session: credential.session)
        } else {
            SignInView(session: session)
        }
    }
}
```

`AuthFnSessionModel` is an `ObservableObject` that keeps `credential` in sync with the credential store. It exposes:

```swift
class AuthFnSessionModel: ObservableObject {
    @Published private(set) var credential: AuthFnCredential?
    @Published private(set) var loading: Bool = false
    @Published private(set) var lastError: AuthFnError?

    func signInWithPassword(email: String, password: String) async throws
    func signInWithOtp(...) async throws
    func startSignInWithApple() async throws
    func signOut() async throws
}
```

## Token storage

Bearer tokens are sensitive. The default store is in-memory; for shipping apps, write a Keychain-backed implementation:

```swift
struct KeychainCredentialStore: AuthFnCredentialStore {
    func getCredential() async throws -> AuthFnCredential? {
        // SecItemCopyMatching(...)
    }
    func setCredential(_ credential: AuthFnCredential?) async throws {
        // SecItemAdd / SecItemDelete
    }
}
```

A reference implementation lives in `AuthFnSwift/Sources/AuthFnClient/Credentials/Keychain.swift` (gated behind a `Keychain` flag).

## Test harnesses

`AuthFnClient` accepts an injected `URLSession`. For unit tests, use `URLProtocol` to stub responses; the test target ships utilities for this.

## Related

- [Quickstart → Swift](../quickstart/swift)
- [Plugins → Native handoff](../plugins/native-handoff)
- [Plugins → Social OAuth → Apple](../plugins/social-oauth/apple)
- [Recipes → Native mobile handoff](../recipes/native-mobile-handoff)
