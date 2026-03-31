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
    name: "SearchFnSwift",
    platforms: [
        .macOS(.v13),
        .iOS(.v16),
    ],
    products: [
        .library(name: "SearchFnCore", targets: ["SearchFnCore"]),
        .library(name: "SearchFnAdapterContracts", targets: ["SearchFnAdapterContracts"]),
        .library(name: "SearchFnMemoryAdapter", targets: ["SearchFnMemoryAdapter"]),
        .library(name: "SearchFnSQLiteAdapter", targets: ["SearchFnSQLiteAdapter"]),
        .library(name: "SearchFnClient", targets: ["SearchFnClient"]),
        .library(name: "SearchFnConvenience", targets: ["SearchFnConvenience"]),
        .executable(name: "SearchFnInMemoryExample", targets: ["SearchFnInMemoryExample"]),
        .executable(name: "SearchFnSQLiteExample", targets: ["SearchFnSQLiteExample"]),
    ],
    targets: [
        .target(
            name: "SearchFnAdapterContracts"
        ),
        .target(
            name: "SearchFnCore",
            dependencies: ["SearchFnAdapterContracts"]
        ),
        .target(
            name: "SearchFnMemoryAdapter",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnCore",
            ]
        ),
        .target(
            name: "SearchFnSQLiteAdapter",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnCore",
            ],
            linkerSettings: [
                .linkedLibrary("sqlite3"),
            ]
        ),
        .target(
            name: "SearchFnClient",
            dependencies: ["SearchFnAdapterContracts"]
        ),
        .target(
            name: "SearchFnConvenience",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnMemoryAdapter",
                "SearchFnSQLiteAdapter",
            ]
        ),
        .executableTarget(
            name: "SearchFnInMemoryExample",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnConvenience",
            ],
            path: "Examples/InMemoryExample"
        ),
        .executableTarget(
            name: "SearchFnSQLiteExample",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnConvenience",
                "SearchFnSQLiteAdapter",
            ],
            path: "Examples/SQLiteExample"
        ),
        .testTarget(
            name: "SearchFnClientTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnClient",
                "SearchFnConvenience",
            ],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
        .testTarget(
            name: "SearchFnCoreTests",
            dependencies: [
                "SearchFnAdapterContracts",
                "SearchFnCore",
            ],
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
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
    ]
)
