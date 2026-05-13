import XCTest
@testable import AuthFnClient

final class AuthFnClientTests: XCTestCase {
    func testOAuthCallbackParsingUsesURLComponents() throws {
        let coordinator = AuthFnOAuthCoordinator()
        let callback = try coordinator.parseCallbackURL(
            URL(string: "nucleum://auth/callback?code=abc%20123&state=st_1")!
        )

        XCTAssertEqual(callback.code, "abc 123")
        XCTAssertEqual(callback.state, "st_1")
    }

    func testOAuthCallbackParsingReadsFragmentValues() {
        let coordinator = AuthFnOAuthCoordinator()
        let url = URL(string: "nucleum://oauthsignin#token=st_1&signup=true&regionId=insouth")!

        XCTAssertEqual(coordinator.callbackValue(url, name: "token"), "st_1")
        XCTAssertEqual(coordinator.callbackValue(url, name: "signup"), "true")
        XCTAssertEqual(coordinator.callbackValue(url, name: "regionId"), "insouth")
    }

    func testAppleAuthorizeContextExtractsStateAndNonceWithoutTrustingRedirectUri() {
        let coordinator = AuthFnOAuthCoordinator()
        let url = URL(string: "https://appleid.apple.com/auth/authorize?state=st_1&nonce=nonce_1&redirect_uri=https%3A%2F%2Faccount-insouth-dev.nucleum.app%2Fauth%2Fsocial%2Fcallback%2Fapple")!

        let context = coordinator.appleAuthorizeContext(from: url)

        XCTAssertEqual(context?.stateId, "st_1")
        XCTAssertEqual(context?.nonce, "nonce_1")
        XCTAssertNil(context?.accountBaseURL)
    }

    func testRegionCacheNormalizesAndExpiresEntries() async {
        let cache = AuthFnRegionCache()
        await cache.set(identifier: " Ada@Example.COM ", regionId: "eu-west-1", authority: "https://eu.example.com", ttl: 60)

        let entry = await cache.get(identifier: "ada@example.com")
        XCTAssertEqual(entry?.regionId, "eu-west-1")

        await cache.set(identifier: "expired@example.com", regionId: "us-east-1", authority: "https://us.example.com", ttl: -1)
        let expired = await cache.get(identifier: "expired@example.com")
        XCTAssertNil(expired)
    }

    func testInMemoryCredentialStoreRoundTrip() async throws {
        let store = AuthFnInMemoryCredentialStore()
        let credential = AuthFnSessionCredential(
            session: AuthFnSession(
                id: "sess_1",
                actorId: "user_1",
                regionId: "us-east-1",
                primaryEmail: "ada@example.com",
                methods: ["password"]
            ),
            token: "st_123"
        )

        try await store.saveCredential(credential)
        let loaded = try await store.loadCredential()
        XCTAssertEqual(loaded, credential)

        try await store.clearCredential()
        let cleared = try await store.loadCredential()
        XCTAssertNil(cleared)
    }
}
