import XCTest
@testable import DatafnAppleHost

final class HostTopologyTests: XCTestCase {
    func testTopologyMatrixMatchesOwnershipRules() throws {
        let options = makeOptions()

        let browser = DatafnExampleTopology.browserOwned.makeEmbeddedTopology(options: options)
        XCTAssertEqual(browser.storage, "indexeddb")
        XCTAssertEqual(browser.syncOwner, "javascript")
        XCTAssertEqual(DatafnExampleTopology.browserOwned.searchBackend, "SearchFn IndexedDB (JavaScript-owned)")
        XCTAssertFalse(browser.indexedDbDisabled)
        XCTAssertNil(browser.remoteMode)

        let nativeServer = DatafnExampleTopology.nativeDatafnServer.makeEmbeddedTopology(options: options)
        XCTAssertEqual(nativeServer.storage, "native-backed")
        XCTAssertEqual(nativeServer.syncOwner, "native")
        XCTAssertEqual(nativeServer.remoteMode, "datafn-server")
        XCTAssertEqual(nativeServer.remoteProfile, "default")
        XCTAssertEqual(DatafnExampleTopology.nativeDatafnServer.searchBackend, "SearchFn SQLite (Swift-owned)")
        XCTAssertTrue(nativeServer.indexedDbDisabled)

        let nativeICloud = DatafnExampleTopology.nativeICloud.makeEmbeddedTopology(options: options)
        XCTAssertEqual(nativeICloud.storage, "native-backed")
        XCTAssertEqual(nativeICloud.syncOwner, "native")
        XCTAssertEqual(nativeICloud.remoteMode, "icloud")
        XCTAssertEqual(nativeICloud.cloudKitContainerIdentifier, options.cloudKitContainerIdentifier)
        XCTAssertEqual(
            DatafnExampleTopology.nativeICloud.searchBackend,
            "SearchFn SQLite (Swift-owned, CloudKit-derived records)"
        )
        XCTAssertTrue(nativeICloud.indexedDbDisabled)
    }

    func testBootstrapScriptInjectsStableGlobals() throws {
        let options = makeOptions()

        let browserScript = try DatafnExampleBridgeBootstrapScript.make(
            topology: .browserOwned,
            options: options
        )
        XCTAssertTrue(browserScript.contains("window.__DATAFN_EXAMPLE_TOPOLOGY__"))
        XCTAssertTrue(browserScript.contains("window.__DATAFN_NATIVE_CONFIG__ = undefined;"))

        let nativeScript = try DatafnExampleBridgeBootstrapScript.make(
            topology: .nativeDatafnServer,
            options: options
        )
        XCTAssertTrue(nativeScript.contains("\"remoteMode\":\"datafn-server\""))
        XCTAssertTrue(nativeScript.contains("\"indexedDbDisabled\":true"))
    }

    func testRuntimePlansSeparateServerAndCloudKitModes() throws {
        let options = makeOptions()

        XCTAssertNil(DatafnExampleTopology.browserOwned.makeRuntimePlan(options: options))

        let serverPlan = try XCTUnwrap(
            DatafnExampleTopology.nativeDatafnServer.makeRuntimePlan(options: options)
        )
        XCTAssertEqual(serverPlan.remoteMode, "datafn-server")
        XCTAssertEqual(serverPlan.remoteProfile, "default")
        XCTAssertEqual(serverPlan.datafnServerBaseURL, options.datafnServerBaseURL)
        XCTAssertNil(serverPlan.cloudKitContainerIdentifier)

        let cloudPlan = try XCTUnwrap(
            DatafnExampleTopology.nativeICloud.makeRuntimePlan(options: options)
        )
        XCTAssertEqual(cloudPlan.remoteMode, "icloud")
        XCTAssertNil(cloudPlan.datafnServerBaseURL)
        XCTAssertEqual(cloudPlan.cloudKitContainerIdentifier, options.cloudKitContainerIdentifier)
    }

    func testRuntimeFactoryEnablesNativeSearchForEmbeddedModes() throws {
        let options = makeOptions()

        XCTAssertNil(
            DatafnExampleRuntimeFactory.makeConfiguration(
                topology: .browserOwned,
                options: options
            )
        )

        let serverConfiguration = try XCTUnwrap(
            DatafnExampleRuntimeFactory.makeConfiguration(
                topology: .nativeDatafnServer,
                options: options
            )
        )
        XCTAssertNotNil(serverConfiguration.search)

        let cloudConfiguration = try XCTUnwrap(
            DatafnExampleRuntimeFactory.makeConfiguration(
                topology: .nativeICloud,
                options: options
            )
        )
        XCTAssertNotNil(cloudConfiguration.search)
    }

    private func makeOptions() -> DatafnExampleHostOptions {
        DatafnExampleHostOptions(
            schemaHash: DatafnExampleSchema.schemaHash,
            namespace: DatafnExampleSchema.namespace,
            clientID: DatafnExampleSchema.clientID,
            storeRootURL: URL(fileURLWithPath: "/tmp/DatafnAppleHost", isDirectory: true),
            webAppURL: URL(string: "http://127.0.0.1:4173"),
            datafnServerBaseURL: URL(string: "http://127.0.0.1:3001/datafn")!,
            datafnServerWebSocketURL: URL(string: "ws://127.0.0.1:3001/datafn/ws")!,
            cloudKitContainerIdentifier: DatafnExampleSchema.cloudKitContainerIdentifier
        )
    }
}
