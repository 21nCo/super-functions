import Foundation

#if os(iOS)
import AuthenticationServices
import UIKit

public struct AuthFnNativeAppleSignInFailure: Error, Equatable, Sendable {
    public var code: String
    public var message: String?

    public init(code: String, message: String? = nil) {
        self.code = code
        self.message = message
    }
}

public final class AuthFnNativeAppleSignInCoordinator: NSObject {
    public typealias Completion = (Result<AuthFnNativeAppleSignInResult, AuthFnNativeAppleSignInFailure>) -> Void
    public typealias PresentationAnchorProvider = () -> ASPresentationAnchor?

    private let oauthCoordinator = AuthFnOAuthCoordinator()
    private var client: AuthFnClient?
    private var stateId: String?
    private var accountBaseURL: URL?
    private var device: [String: String] = [:]
    private var completion: Completion?
    private var presentationAnchorProvider: PresentationAnchorProvider?
    private var controller: ASAuthorizationController?
    private var isInProgress = false

    public override init() {}

    public func start(
        client: AuthFnClient,
        accountBaseURL: URL,
        returnTo: String,
        handoffMode: String = "session-token",
        device: [String: String] = [:],
        presentationAnchor: @escaping PresentationAnchorProvider,
        completion: @escaping Completion
    ) {
        Task { @MainActor in
            guard !self.isInProgress else {
                completion(.failure(.init(code: "already_in_progress")))
                return
            }
            self.isInProgress = true
            self.client = client
            self.accountBaseURL = accountBaseURL
            self.device = device
            self.completion = completion
            self.presentationAnchorProvider = presentationAnchor

            do {
                let start = try await client.startNativeAppleSignIn(
                    accountBaseURL: accountBaseURL,
                    returnTo: returnTo,
                    handoffMode: handoffMode
                )
                self.beginAuthorization(stateId: start.stateId, nonce: start.nonce)
            } catch {
                self.finish(.failure(.init(code: "start_failed", message: error.localizedDescription)))
            }
        }
    }

    public func startFromAuthorizeURL(
        _ authorizeURL: URL,
        client: AuthFnClient,
        fallbackAccountBaseURL: URL,
        device: [String: String] = [:],
        presentationAnchor: @escaping PresentationAnchorProvider,
        completion: @escaping Completion
    ) -> Bool {
        guard let context = oauthCoordinator.appleAuthorizeContext(from: authorizeURL) else {
            return false
        }

        Task { @MainActor in
            guard !self.isInProgress else {
                completion(.failure(.init(code: "already_in_progress")))
                return
            }
            self.isInProgress = true
            self.client = client
            self.accountBaseURL = context.accountBaseURL ?? fallbackAccountBaseURL
            self.device = device
            self.completion = completion
            self.presentationAnchorProvider = presentationAnchor
            self.beginAuthorization(stateId: context.stateId, nonce: context.nonce)
        }
        return true
    }

    public func cancel() {
        Task { @MainActor in
            self.finish(.failure(.init(code: "cancelled")))
        }
    }

    @MainActor
    private func beginAuthorization(stateId: String, nonce: String) {
        self.stateId = stateId

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    @MainActor
    private func finish(_ result: Result<AuthFnNativeAppleSignInResult, AuthFnNativeAppleSignInFailure>) {
        let completion = completion
        completion?(result)
        client = nil
        stateId = nil
        accountBaseURL = nil
        device = [:]
        self.completion = nil
        presentationAnchorProvider = nil
        controller = nil
        isInProgress = false
    }
}

extension AuthFnNativeAppleSignInCoordinator: ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    @MainActor
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let anchor = presentationAnchorProvider?() {
            return anchor
        }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
            ?? UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first
            ?? ASPresentationAnchor()
    }

    @MainActor
    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let identityTokenData = credential.identityToken,
            let identityToken = String(data: identityTokenData, encoding: .utf8),
            let stateId,
            let accountBaseURL,
            let client
        else {
            finish(.failure(.init(code: "missing_identity_token")))
            return
        }

        let authorizationCode = credential.authorizationCode
            .flatMap { String(data: $0, encoding: .utf8) }
        let user = AuthFnNativeAppleUser(
            email: credential.email,
            name: AuthFnNativeAppleUserName(
                firstName: credential.fullName?.givenName,
                lastName: credential.fullName?.familyName
            )
        )
        let hasUserDetails = user.email != nil || user.name?.firstName != nil || user.name?.lastName != nil

        Task { @MainActor in
            do {
                let result = try await client.completeNativeAppleSignIn(
                    accountBaseURL: accountBaseURL,
                    stateId: stateId,
                    identityToken: identityToken,
                    authorizationCode: authorizationCode,
                    user: hasUserDetails ? user : nil,
                    device: device
                )
                self.finish(.success(result))
            } catch {
                self.finish(.failure(.init(code: "complete_failed", message: error.localizedDescription)))
            }
        }
    }

    public func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            self.finish(.failure(.init(code: "authorization_failed", message: error.localizedDescription)))
        }
    }
}
#endif
