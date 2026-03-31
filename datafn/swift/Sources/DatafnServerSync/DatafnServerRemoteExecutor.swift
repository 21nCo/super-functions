import DatafnCoreDataStore
import DatafnWebViewBridgeHost
import Foundation

public enum DatafnServerTransportKind: String, Sendable {
    case http
    case webSocket
}

public enum DatafnServerRemoteMethod: String, CaseIterable, Sendable {
    case query
    case mutation
    case transact
    case seed
    case clone
    case pull
    case push
    case reconcile
}

public struct DatafnServerRequestContext: Sendable {
    public let method: String
    public let profileID: String
    public let url: URL
    public let transport: DatafnServerTransportKind

    public init(
        method: String,
        profileID: String,
        url: URL,
        transport: DatafnServerTransportKind
    ) {
        self.method = method
        self.profileID = profileID
        self.url = url
        self.transport = transport
    }
}

public typealias DatafnServerRequestAuthorizer = @Sendable (
    URLRequest,
    DatafnServerRequestContext
) async throws -> URLRequest

public protocol DatafnServerWebSocketConnection: AnyObject, Sendable {
    func resume()
    func cancel()
    func receiveString() async throws -> String
    func sendString(_ text: String) async throws
}

public struct DatafnServerRemoteExecutorConfiguration: Sendable {
    public let baseURL: URL
    public let websocketURL: URL?
    public let profileID: String
    public let requestAuthorizer: DatafnServerRequestAuthorizer?

    public init(
        baseURL: URL,
        websocketURL: URL? = nil,
        profileID: String,
        requestAuthorizer: DatafnServerRequestAuthorizer? = nil
    ) {
        self.baseURL = baseURL
        self.websocketURL = websocketURL
        self.profileID = profileID
        self.requestAuthorizer = requestAuthorizer
    }
}

public final class DatafnServerRemoteExecutor: @unchecked Sendable {
    public typealias HTTPSender = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)
    public typealias WebSocketFactory = @Sendable (URLRequest) -> DatafnServerWebSocketConnection

    public let configuration: DatafnServerRemoteExecutorConfiguration

    private let httpSender: HTTPSender
    private let webSocketFactory: WebSocketFactory?

    public init(
        configuration: DatafnServerRemoteExecutorConfiguration,
        httpSender: HTTPSender? = nil,
        webSocketFactory: WebSocketFactory? = nil
    ) {
        self.configuration = configuration
        self.httpSender = httpSender ?? Self.makeDefaultHTTPSender()
        if let webSocketFactory {
            self.webSocketFactory = webSocketFactory
        } else if configuration.websocketURL != nil {
            self.webSocketFactory = Self.makeDefaultWebSocketFactory()
        } else {
            self.webSocketFactory = nil
        }
    }

    public func query(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .query, payload: payload)
    }

    public func mutation(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .mutation, payload: payload)
    }

    public func transact(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .transact, payload: payload)
    }

    public func seed(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .seed, payload: payload)
    }

    public func clone(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .clone, payload: payload)
    }

    public func pull(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .pull, payload: payload)
    }

    public func push(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .push, payload: payload)
    }

    public func reconcile(_ payload: DatafnJSONValue?) async throws -> DatafnJSONValue {
        try await perform(method: .reconcile, payload: payload)
    }

    public func makeWebSocketConnection() async throws -> DatafnServerWebSocketConnection? {
        guard
            let websocketURL = configuration.websocketURL,
            let webSocketFactory
        else {
            return nil
        }

        var request = URLRequest(url: websocketURL)
        request.httpMethod = "GET"

        if let requestAuthorizer = configuration.requestAuthorizer {
            request = try await requestAuthorizer(
                request,
                DatafnServerRequestContext(
                    method: "websocket",
                    profileID: configuration.profileID,
                    url: websocketURL,
                    transport: .webSocket
                )
            )
        }

        return webSocketFactory(request)
    }

    public func perform(
        method: DatafnServerRemoteMethod,
        payload: DatafnJSONValue?
    ) async throws -> DatafnJSONValue {
        let endpointURL = configuration.baseURL.appendingPathComponent(method.rawValue)
        var request = URLRequest(url: endpointURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let payload {
            request.httpBody = try Self.encodeJSON(payload)
        }

        if let requestAuthorizer = configuration.requestAuthorizer {
            request = try await requestAuthorizer(
                request,
                DatafnServerRequestContext(
                    method: method.rawValue,
                    profileID: configuration.profileID,
                    url: endpointURL,
                    transport: .http
                )
            )
        }

        do {
            let (data, response) = try await httpSender(request)
            switch response.statusCode {
            case 403:
                return .object(Self.errorEnvelope(
                    code: "FORBIDDEN",
                    message: "Remote profile is unauthorized",
                    path: "sync.native.remoteProfile"
                ))
            case 404:
                return .object(Self.errorEnvelope(
                    code: "NOT_FOUND",
                    message: "Native remote profile not found",
                    path: "sync.native.remoteProfile"
                ))
            default:
                break
            }

            let jsonValue = try Self.decodeJSON(data)

            if (200 ..< 300).contains(response.statusCode) {
                return jsonValue
            }

            if let object = jsonValue.objectValue {
                return .object(object)
            }
            throw Self.transportError(for: method)
        } catch let error as DatafnBridgeError {
            throw error
        } catch {
            throw Self.transportError(for: method)
        }
    }

    private static func makeDefaultHTTPSender() -> HTTPSender {
        { request in
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw DatafnBridgeError(
                    code: "TRANSPORT_ERROR",
                    message: "DataFn server sync failed",
                    details: ["path": "sync.transport"]
                )
            }
            return (data, httpResponse)
        }
    }

    private static func makeDefaultWebSocketFactory() -> WebSocketFactory {
        { request in
            URLSessionWebSocketConnection(task: URLSession.shared.webSocketTask(with: request))
        }
    }

    private static func encodeJSON(_ value: DatafnJSONValue) throws -> Data {
        let foundationValue = value.foundationValue()
        if foundationValue is NSNull {
            return Data("null".utf8)
        }
        guard JSONSerialization.isValidJSONObject(foundationValue) else {
            throw DatafnBridgeError(
                code: "DFQL_INVALID",
                message: "Request payload must be valid JSON",
                details: ["path": "payload"]
            )
        }
        return try JSONSerialization.data(withJSONObject: foundationValue)
    }

    private static func decodeJSON(_ data: Data) throws -> DatafnJSONValue {
        if data.isEmpty {
            return .null
        }
        let object = try JSONSerialization.jsonObject(with: data)
        return try jsonValue(from: object)
    }

    private static func jsonValue(from object: Any) throws -> DatafnJSONValue {
        switch object {
        case is NSNull:
            return .null
        case let bool as Bool:
            return .bool(bool)
        case let string as String:
            return .string(string)
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return .bool(number.boolValue)
            }
            return .number(number.doubleValue)
        case let array as [Any]:
            return .array(try array.map(jsonValue(from:)))
        case let dictionary as [String: Any]:
            return .object(try dictionary.mapValues(jsonValue(from:)))
        default:
            throw DatafnBridgeError(
                code: "TRANSPORT_ERROR",
                message: "DataFn server sync failed",
                details: ["path": "sync.response"]
            )
        }
    }

    private static func errorEnvelope(
        code: String,
        message: String,
        path: String
    ) -> DatafnJSONObject {
        [
            "ok": .bool(false),
            "error": .object([
                "code": .string(code),
                "message": .string(message),
                "details": .object(["path": .string(path)]),
            ]),
        ]
    }

    private static func transportError(
        for method: DatafnServerRemoteMethod
    ) -> DatafnBridgeError {
        let path: String
        switch method {
        case .query, .mutation, .transact:
            path = "remote.\(method.rawValue)"
        case .seed, .clone, .pull, .push, .reconcile:
            path = "sync.\(method.rawValue)"
        }
        return DatafnBridgeError(
            code: "TRANSPORT_ERROR",
            message: "DataFn server sync failed",
            details: ["path": .string(path)]
        )
    }
}

private final class URLSessionWebSocketConnection: DatafnServerWebSocketConnection, @unchecked Sendable {
    private let task: URLSessionWebSocketTask

    init(task: URLSessionWebSocketTask) {
        self.task = task
    }

    func resume() {
        task.resume()
    }

    func cancel() {
        task.cancel(with: .goingAway, reason: nil)
    }

    func receiveString() async throws -> String {
        switch try await task.receive() {
        case .string(let text):
            return text
        case .data(let data):
            return String(decoding: data, as: UTF8.self)
        @unknown default:
            return ""
        }
    }

    func sendString(_ text: String) async throws {
        try await task.send(.string(text))
    }
}
