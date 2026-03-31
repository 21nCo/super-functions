import Testing
@testable import DatafnAppleRuntime
@testable import DatafnCoreDataStore
@testable import DatafnSearchContracts

@Suite("Datafn native search rebuild")
struct DatafnSearchRebuildTests {
    @Test("TV-DFS-007: digest mismatch clears stale search state and rebuilds from Core Data")
    func digestMismatchClearsAndRebuildsFromCoreData() async throws {
        let storeRootURL = makeStoreRootURLForTesting()
        let runtime1 = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "old-hash",
                namespace: "org-1:user-rebuild",
                clientID: "device-old",
                storeRootURL: storeRootURL,
                search: DatafnSearchBackendConfiguration(),
                syncBackend: makeDatafnServerSyncBackendForTesting()
            )
        )
        let store1 = await runtime1.storeForTesting()
        let backend1 = try #require(await runtime1.searchBackendForTesting())

        try await backend1.applyUpdate(
            DatafnSearchUpdateRequest(
                resource: "todos",
                operation: .upsert,
                documents: [
                    DatafnSearchDocument(id: "stale:1", fields: ["text": "legacy doc"]),
                ]
            )
        )
        try store1.upsertRecord(
            resource: "todos",
            record: [
                "id": "td-30",
                "text": "new schema task",
            ]
        )
        await backend1.dispose()
        store1.close()

        let runtime2 = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "new-hash",
                namespace: "org-1:user-rebuild",
                clientID: "device-new",
                storeRootURL: storeRootURL,
                search: DatafnSearchBackendConfiguration(),
                syncBackend: makeDatafnServerSyncBackendForTesting()
            )
        )
        let snapshot = await runtime2.snapshotForTesting()
        let store2 = await runtime2.storeForTesting()
        let metadata = try store2.searchMetadataSnapshot()
        let rebuiltResults = try await runtime2.search(
            DatafnSearchRequest(resource: "todos", query: "new schema")
        )
        let staleResults = try await runtime2.search(
            DatafnSearchRequest(resource: "todos", query: "legacy")
        )

        #expect(snapshot.searchStatusTransitions == ["rebuilding", "ready"])
        #expect(snapshot.searchStatus == "ready")
        #expect(snapshot.searchBackendKind == "searchfn")
        #expect(snapshot.searchConfigDigest == metadata.configDigest)
        #expect(snapshot.searchRootURL?.lastPathComponent == "SearchFn")
        #expect(snapshot.searchRootURL != snapshot.storeURL)
        #expect(metadata.backendKind == "searchfn")
        #expect(metadata.schemaHash == "new-hash")
        #expect(metadata.configDigest != nil)
        #expect(metadata.status == .ready)
        #expect(rebuiltResults == ["td-30"])
        #expect(staleResults == [])
    }

    @Test("TV-DFS-007 negative / DERR-001: rebuild failure throws SEARCH_INDEX_REBUILD_FAILED when failIfUnavailable is true")
    func rebuildFailureThrowsWhenFailIfUnavailableIsTrue() async throws {
        let blockingSearchRootURL = try makeBlockingSearchRootURLForTesting()

        do {
            _ = try await DatafnAppleRuntime(
                configuration: DatafnAppleRuntimeConfiguration(
                    schemaJSON: makeSearchSchemaJSONForTesting(),
                    schemaHash: "rebuild-fail-hash",
                    namespace: "org-1:user-fail-hard",
                    clientID: "device-hard-fail",
                    storeRootURL: makeStoreRootURLForTesting(),
                    search: DatafnSearchBackendConfiguration(
                        searchRootURL: blockingSearchRootURL,
                        failIfUnavailable: true
                    ),
                    syncBackend: makeDatafnServerSyncBackendForTesting()
                )
            )
            Issue.record("Expected rebuild failure to throw")
        } catch let error as DatafnSearchError {
            #expect(error.code == DATAFN_SEARCH_INDEX_REBUILD_FAILED)
            #expect(error.details?.path == "search.rebuild")
        }
    }

    @Test("DREB-001: rebuild failure is suppressed when failIfUnavailable is false and metadata stays unavailable")
    func rebuildFailureIsSuppressedWhenFailIfUnavailableIsFalse() async throws {
        let blockingSearchRootURL = try makeBlockingSearchRootURLForTesting()
        let runtime = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "rebuild-soft-hash",
                namespace: "org-1:user-fail-soft",
                clientID: "device-soft-fail",
                storeRootURL: makeStoreRootURLForTesting(),
                search: DatafnSearchBackendConfiguration(
                    searchRootURL: blockingSearchRootURL,
                    failIfUnavailable: false
                ),
                syncBackend: makeDatafnServerSyncBackendForTesting()
            )
        )

        let snapshot = await runtime.snapshotForTesting()
        let metadata = try (await runtime.storeForTesting()).searchMetadataSnapshot()

        #expect(snapshot.searchBackendKind == nil)
        #expect(snapshot.searchStatus == "unavailable")
        #expect(snapshot.searchStatusTransitions == ["rebuilding"])
        #expect(metadata.status == .unavailable)
        #expect(metadata.configDigest != nil)

        do {
            _ = try await runtime.search(DatafnSearchRequest(resource: "todos", query: "milk"))
            Issue.record("Expected runtime search to be unavailable after suppressed rebuild failure")
        } catch let error as DatafnSearchError {
            #expect(error.code == DATAFN_NATIVE_SEARCH_UNAVAILABLE)
        }
    }

    @Test("DPST-001: CloudKit mode keeps SearchFn files under the namespace support directory as local-only state")
    func cloudKitModeKeepsSearchFilesLocalOnly() async throws {
        let runtime = try await DatafnAppleRuntime(
            configuration: DatafnAppleRuntimeConfiguration(
                schemaJSON: makeSearchSchemaJSONForTesting(),
                schemaHash: "icloud-search-hash",
                namespace: "personal:user-search",
                clientID: "device-icloud-search",
                storeRootURL: makeStoreRootURLForTesting(),
                search: DatafnSearchBackendConfiguration(),
                syncBackend: .iCloud(
                    DatafnCloudKitConfiguration(containerIdentifier: "iCloud.com.example.app")
                )
            )
        )

        let snapshot = await runtime.snapshotForTesting()
        let metadata = try (await runtime.storeForTesting()).searchMetadataSnapshot()

        #expect(snapshot.remoteMode == .iCloud)
        #expect(snapshot.usesCloudKitPersistentContainer)
        #expect(snapshot.searchRootURL?.lastPathComponent == "SearchFn")
        #expect(snapshot.searchRootURL != snapshot.storeURL)
        #expect(snapshot.searchStatusTransitions == ["rebuilding", "ready"])
        #expect(metadata.status == .ready)
        #expect(metadata.backendKind == "searchfn")
    }
}
