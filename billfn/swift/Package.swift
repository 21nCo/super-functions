// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BillFnSwift",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "BillFnClient", targets: ["BillFnClient"]),
        .library(name: "BillFnStoreKit", targets: ["BillFnStoreKit"]),
        .library(name: "BillFnWebViewBridgeHost", targets: ["BillFnWebViewBridgeHost"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/swiftlang/swift-testing.git",
            revision: "5ee435b15ad40ec1f644b5eb9d247f263ccd2170"
        ),
    ],
    targets: [
        .target(name: "BillFnClient"),
        .target(
            name: "BillFnStoreKit",
            dependencies: ["BillFnClient"]
        ),
        .target(
            name: "BillFnWebViewBridgeHost",
            dependencies: ["BillFnClient", "BillFnStoreKit"]
        ),
        .testTarget(
            name: "BillFnClientTests",
            dependencies: [
                "BillFnClient",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
        .testTarget(
            name: "BillFnWebViewBridgeHostTests",
            dependencies: [
                "BillFnWebViewBridgeHost",
                .product(name: "Testing", package: "swift-testing"),
            ]
        ),
    ]
)
