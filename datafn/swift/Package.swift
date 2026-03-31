// swift-tools-version: 5.9
import Foundation
import PackageDescription

let fileManager = FileManager.default
let developerFrameworkSearchPath: String? = {
    let commandLineToolsPath = "/Library/Developer/CommandLineTools/Library/Developer/Frameworks"
    if fileManager.fileExists(atPath: commandLineToolsPath) {
        return commandLineToolsPath
    }

    if let developerDirectory = ProcessInfo.processInfo.environment["DEVELOPER_DIR"] {
        let candidate = URL(fileURLWithPath: developerDirectory)
            .appendingPathComponent("Library/Developer/Frameworks", isDirectory: true)
            .path
        if fileManager.fileExists(atPath: candidate) {
            return candidate
        }
    }

    return nil
}()

let testSwiftSettings: [SwiftSetting] = developerFrameworkSearchPath.map {
    [.unsafeFlags(["-F", $0])]
} ?? []

let testLinkerSettings: [LinkerSetting] = developerFrameworkSearchPath.map {
    [.unsafeFlags(["-F", $0, "-Xlinker", "-rpath", "-Xlinker", $0])]
} ?? []

let package = Package(
    name: "DatafnApple",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "DatafnAppleRuntime", targets: ["DatafnAppleRuntime"]),
        .library(name: "DatafnCloudKitSync", targets: ["DatafnCloudKitSync"]),
        .library(name: "DatafnCoreDataStore", targets: ["DatafnCoreDataStore"]),
        .library(name: "DatafnSearchContracts", targets: ["DatafnSearchContracts"]),
        .library(name: "DatafnSearchFnBackend", targets: ["DatafnSearchFnBackend"]),
        .library(name: "DatafnServerSync", targets: ["DatafnServerSync"]),
        .library(name: "DatafnWebViewBridgeHost", targets: ["DatafnWebViewBridgeHost"]),
        .library(name: "DatafnSwiftUI", targets: ["DatafnSwiftUI"]),
    ],
    dependencies: [
        .package(name: "SearchFnSwift", path: "../../searchfn/swift-package"),
    ],
    targets: [
        .target(
            name: "DatafnAppleRuntime",
            dependencies: [
                "DatafnCloudKitSync",
                "DatafnCoreDataStore",
                "DatafnSearchContracts",
                "DatafnSearchFnBackend",
                "DatafnServerSync",
                "DatafnWebViewBridgeHost",
            ]
        ),
        .target(
            name: "DatafnCloudKitSync",
            dependencies: ["DatafnCoreDataStore"]
        ),
        .target(name: "DatafnCoreDataStore"),
        .target(name: "DatafnSearchContracts"),
        .target(
            name: "DatafnSearchFnBackend",
            dependencies: [
                "DatafnSearchContracts",
                .product(name: "SearchFnAdapterContracts", package: "SearchFnSwift"),
                .product(name: "SearchFnClient", package: "SearchFnSwift"),
                .product(name: "SearchFnSQLiteAdapter", package: "SearchFnSwift"),
            ]
        ),
        .target(
            name: "DatafnServerSync",
            dependencies: [
                "DatafnCoreDataStore",
                "DatafnWebViewBridgeHost",
            ]
        ),
        .target(
            name: "DatafnWebViewBridgeHost",
            dependencies: [
                "DatafnCloudKitSync",
                "DatafnCoreDataStore",
                "DatafnSearchContracts",
            ]
        ),
        .target(
            name: "DatafnSwiftUI",
            dependencies: [
                "DatafnAppleRuntime",
                "DatafnCoreDataStore",
            ]
        ),
        .testTarget(
            name: "DatafnSwiftUITests",
            dependencies: [
                "DatafnSwiftUI",
                "DatafnAppleRuntime",
                "DatafnCoreDataStore",
                "DatafnWebViewBridgeHost",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnAppleRuntimeTests",
            dependencies: ["DatafnAppleRuntime"],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnCloudKitSyncTests",
            dependencies: [
                "DatafnCloudKitSync",
                "DatafnAppleRuntime",
                "DatafnCoreDataStore",
                "DatafnWebViewBridgeHost",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnCoreDataStoreTests",
            dependencies: ["DatafnCoreDataStore"],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnSearchContractsTests",
            dependencies: ["DatafnSearchContracts"],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnSearchFnBackendTests",
            dependencies: [
                "DatafnSearchFnBackend",
                "DatafnAppleRuntime",
                "DatafnSearchContracts",
                "DatafnWebViewBridgeHost",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnSearchRebuildTests",
            dependencies: [
                "DatafnAppleRuntime",
                "DatafnCoreDataStore",
                "DatafnSearchContracts",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnNativeSearchLifecycleTests",
            dependencies: [
                "DatafnAppleRuntime",
                "DatafnCloudKitSync",
                "DatafnCoreDataStore",
                "DatafnServerSync",
                "DatafnWebViewBridgeHost",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnWebViewBridgeHostTests",
            dependencies: [
                "DatafnWebViewBridgeHost",
                "DatafnCoreDataStore",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "DatafnServerSyncTests",
            dependencies: [
                "DatafnServerSync",
                "DatafnAppleRuntime",
                "DatafnCloudKitSync",
                "DatafnCoreDataStore",
                "DatafnWebViewBridgeHost",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
    ]
)
