import XCTest
import AuthFnClient
@testable import AuthFnWebViewBridgeHost

final class AuthFnWebViewBridgeHostTests: XCTestCase {
    func testOAuthCallbackParsingIsAvailableFromBridgeHostType() throws {
        let callback = try AuthFnOAuthCoordinator().parseCallbackURL(
            URL(string: "nucleum://auth/callback?error=access_denied")!
        )

        XCTAssertEqual(callback.error, "access_denied")
    }
}
