// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AuthFnSwift",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "AuthFnClient", targets: ["AuthFnClient"]),
        .library(name: "AuthFnSwiftUI", targets: ["AuthFnSwiftUI"]),
        .library(name: "AuthFnWebViewBridgeHost", targets: ["AuthFnWebViewBridgeHost"]),
    ],
    targets: [
        .target(name: "AuthFnClient"),
        .target(
            name: "AuthFnSwiftUI",
            dependencies: ["AuthFnClient"]
        ),
        .target(
            name: "AuthFnWebViewBridgeHost",
            dependencies: ["AuthFnClient"]
        ),
        .testTarget(
            name: "AuthFnClientTests",
            dependencies: ["AuthFnClient"]
        ),
        .testTarget(
            name: "AuthFnWebViewBridgeHostTests",
            dependencies: ["AuthFnWebViewBridgeHost", "AuthFnClient"]
        ),
    ]
)
