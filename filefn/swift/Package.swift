// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FileFnSwift",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "FileFnClient", targets: ["FileFnClient"]),
        .library(name: "FileFnSwiftUI", targets: ["FileFnSwiftUI"]),
        .library(name: "FileFnWebViewBridgeHost", targets: ["FileFnWebViewBridgeHost"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/swiftlang/swift-testing.git",
            revision: "5ee435b15ad40ec1f644b5eb9d247f263ccd2170"
        ),
    ],
    targets: [
        .target(name: "FileFnClient"),
        .target(
            name: "FileFnWebViewBridgeHost",
            dependencies: ["FileFnClient"]
        ),
        .target(
            name: "FileFnSwiftUI",
            dependencies: ["FileFnClient"]
        ),
        .testTarget(
            name: "FileFnClientTests",
            dependencies: [
                "FileFnClient",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
        .testTarget(
            name: "FileFnWebViewBridgeHostTests",
            dependencies: [
                "FileFnWebViewBridgeHost",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
        .testTarget(
            name: "FileFnSwiftUITests",
            dependencies: [
                "FileFnSwiftUI",
                "FileFnClient",
                "FileFnWebViewBridgeHost",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
        .testTarget(
            name: "FileFnIntegrationTests",
            dependencies: [
                "FileFnClient",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
    ]
)
