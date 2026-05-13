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
    name: "SuperfunctionsSwift",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(name: "AuthFnClient", targets: ["AuthFnClient"]),
        .library(name: "AuthFnSwiftUI", targets: ["AuthFnSwiftUI"]),
        .library(name: "AuthFnWebViewBridgeHost", targets: ["AuthFnWebViewBridgeHost"]),
        .library(name: "FileFnClient", targets: ["FileFnClient"]),
        .library(name: "FileFnSwiftUI", targets: ["FileFnSwiftUI"]),
        .library(name: "FileFnWebViewBridgeHost", targets: ["FileFnWebViewBridgeHost"]),
        .library(name: "SearchFnCore", targets: ["SearchFnCore"]),
        .library(name: "SearchFnAdapterContracts", targets: ["SearchFnAdapterContracts"]),
        .library(name: "SearchFnMemoryAdapter", targets: ["SearchFnMemoryAdapter"]),
        .library(name: "SearchFnSQLiteAdapter", targets: ["SearchFnSQLiteAdapter"]),
        .library(name: "SearchFnClient", targets: ["SearchFnClient"]),
        .library(name: "SearchFnConvenience", targets: ["SearchFnConvenience"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/swiftlang/swift-testing.git",
            revision: "980fec0f03c56f771acfcc5be472d44df9245117"
        ),
    ],
    targets: [
        .target(name: "AuthFnClient", path: "authfn/swift/Sources/AuthFnClient"),
        .target(
            name: "AuthFnSwiftUI",
            dependencies: ["AuthFnClient"],
            path: "authfn/swift/Sources/AuthFnSwiftUI"
        ),
        .target(
            name: "AuthFnWebViewBridgeHost",
            dependencies: ["AuthFnClient"],
            path: "authfn/swift/Sources/AuthFnWebViewBridgeHost"
        ),
        .target(name: "FileFnClient", path: "filefn/swift/Sources/FileFnClient"),
        .target(
            name: "FileFnWebViewBridgeHost",
            dependencies: ["FileFnClient"],
            path: "filefn/swift/Sources/FileFnWebViewBridgeHost"
        ),
        .target(
            name: "FileFnSwiftUI",
            dependencies: ["FileFnClient"],
            path: "filefn/swift/Sources/FileFnSwiftUI"
        ),
        .target(
            name: "SearchFnAdapterContracts",
            path: "searchfn/swift/Sources/SearchFnAdapterContracts"
        ),
        .target(
            name: "SearchFnCore",
            dependencies: ["SearchFnAdapterContracts"],
            path: "searchfn/swift/Sources/SearchFnCore"
        ),
        .target(
            name: "SearchFnMemoryAdapter",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnCore",
            ],
            path: "searchfn/swift/Sources/SearchFnMemoryAdapter"
        ),
        .target(
            name: "SearchFnSQLiteAdapter",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnCore",
            ],
            path: "searchfn/swift/Sources/SearchFnSQLiteAdapter",
            linkerSettings: [
                .linkedLibrary("sqlite3"),
            ]
        ),
        .target(
            name: "SearchFnClient",
            dependencies: ["SearchFnAdapterContracts"],
            path: "searchfn/swift/Sources/SearchFnClient"
        ),
        .target(
            name: "SearchFnConvenience",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnMemoryAdapter",
                "SearchFnSQLiteAdapter",
            ],
            path: "searchfn/swift/Sources/SearchFnConvenience"
        ),
        .testTarget(
            name: "AuthFnClientTests",
            dependencies: ["AuthFnClient"],
            path: "authfn/swift/Tests/AuthFnClientTests"
        ),
        .testTarget(
            name: "AuthFnWebViewBridgeHostTests",
            dependencies: ["AuthFnWebViewBridgeHost", "AuthFnClient"],
            path: "authfn/swift/Tests/AuthFnWebViewBridgeHostTests"
        ),
        .testTarget(
            name: "FileFnClientTests",
            dependencies: [
                "FileFnClient",
                .product(name: "Testing", package: "swift-testing"),
            ],
            path: "filefn/swift/Tests/FileFnClientTests"
        ),
        .testTarget(
            name: "FileFnWebViewBridgeHostTests",
            dependencies: [
                "FileFnWebViewBridgeHost",
                .product(name: "Testing", package: "swift-testing"),
            ],
            path: "filefn/swift/Tests/FileFnWebViewBridgeHostTests"
        ),
        .testTarget(
            name: "FileFnSwiftUITests",
            dependencies: [
                "FileFnSwiftUI",
                "FileFnClient",
                "FileFnWebViewBridgeHost",
                .product(name: "Testing", package: "swift-testing"),
            ],
            path: "filefn/swift/Tests/FileFnSwiftUITests"
        ),
        .testTarget(
            name: "FileFnIntegrationTests",
            dependencies: [
                "FileFnClient",
                .product(name: "Testing", package: "swift-testing"),
            ],
            path: "filefn/swift/Tests/FileFnIntegrationTests"
        ),
        .testTarget(
            name: "SearchFnClientTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnConvenience",
            ],
            path: "searchfn/swift/Tests/SearchFnClientTests",
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "SearchFnCoreTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnCore",
            ],
            path: "searchfn/swift/Tests/SearchFnCoreTests",
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "SearchFnMemoryAdapterTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnConvenience",
                "SearchFnMemoryAdapter",
            ],
            path: "searchfn/swift/Tests/SearchFnMemoryAdapterTests",
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "SearchFnSQLiteAdapterTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnConvenience",
                "SearchFnSQLiteAdapter",
            ],
            path: "searchfn/swift/Tests/SearchFnSQLiteAdapterTests",
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "SearchFnConformanceTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnMemoryAdapter",
                "SearchFnSQLiteAdapter",
            ],
            path: "searchfn/swift/Tests/SearchFnConformanceTests",
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
    ]
)
