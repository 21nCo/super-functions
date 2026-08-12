import AuthFnClient
import Foundation
import SwiftUI

@MainActor
public final class AuthFnSessionModel: ObservableObject {
    @Published public private(set) var credential: AuthFnSessionCredential?
    @Published public private(set) var isAuthenticated = false
    @Published public private(set) var error: Error?

    private let client: AuthFnClient

    public init(client: AuthFnClient) {
        self.client = client
    }

    public func refresh() async {
        do {
            credential = try await client.storedCredential()
            isAuthenticated = credential != nil
            error = nil
        } catch {
            self.error = error
            credential = nil
            isAuthenticated = false
        }
    }

    public func signOut() async {
        do {
            try await client.signOut()
            credential = nil
            isAuthenticated = false
            error = nil
        } catch {
            let signOutError = error
            await refresh()
            self.error = signOutError
        }
    }
}
