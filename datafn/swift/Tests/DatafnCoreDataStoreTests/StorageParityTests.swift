import Testing
import CoreData
@testable import DatafnCoreDataStore

@Suite("DatafnCoreDataStore parity")
struct StorageParityTests {
    @Test("TV-STO-001: Core Data-backed storage implements full DataFn semantics")
    func coreDataBackedStorageImplementsFullDatafnSemantics() throws {
        let store = try makeStore(namespace: "org-1:user-1")

        try store.upsertRecord(
            resource: "tasks",
            record: [
                "id": "task:1",
                "title": "A",
            ]
        )

        let merged = try store.mergeRecord(
            resource: "tasks",
            id: "task:1",
            partial: [
                "meta": [
                    "p": 1,
                ],
            ]
        )

        let appended = try store.changelogAppend(
            entry: DatafnChangelogPendingEntry(
                clientId: "d1",
                mutationId: "m1",
                mutation: ["op": "merge"],
                timestampMs: 1
            )
        )
        let duplicate = try store.changelogAppend(
            entry: DatafnChangelogPendingEntry(
                clientId: "d1",
                mutationId: "m1",
                mutation: ["op": "merge"],
                timestampMs: 1
            )
        )
        let health = store.healthCheck()

        #expect(merged == [
            "id": "task:1",
            "title": "A",
            "meta": [
                "p": 1,
            ],
        ])
        #expect(appended.seq == 1)
        #expect(appended == duplicate)
        #expect(health == DatafnStorageHealthReport(ok: true, issues: []))
    }

    @Test("Missing-record merge atomically applies the complete create payload")
    func missingRecordMergeUsesIfMissingPayload() throws {
        let store = try makeStore(namespace: "org-1:user-merge")

        let merged = try store.mergeRecord(
            resource: "tasks",
            id: "task:new",
            partial: ["title": "Patch"],
            ifMissing: [
                "id": "task:new",
                "title": "Patch",
                "status": "draft",
                "createdBy": "user:1",
            ]
        )

        #expect(merged["status"] == "draft")
        #expect(merged["createdBy"] == "user:1")
        #expect(try store.getRecord(resource: "tasks", id: "task:new") == merged)
    }

    @Test("Storage surface covers records, joins, counts, state, changelog, and lifecycle")
    func storageSurfaceCoversRecordsJoinsCountsStateChangelogAndLifecycle() throws {
        let store = try makeStore(namespace: "org-1:user-2")

        try store.upsertRecord(resource: "tasks", record: [
            "id": "task:1",
            "title": "A",
            "status": "open",
        ])
        try store.upsertRecord(resource: "tags", record: [
            "id": "tag:1",
            "label": "blue",
        ])
        try store.upsertRecord(resource: "kv", record: [
            "id": "kv:user",
            "value": [
                "theme": "light",
            ],
        ])

        #expect(try store.getRecord(resource: "tasks", id: "task:1")?["title"] == "A")
        #expect(try store.listRecords(resource: "kv") == [[
            "id": "kv:user",
            "value": [
                "theme": "light",
            ],
        ]])

        try store.upsertJoinRow(relationKey: "join_tasks_tags_tags", row: [
            "from": "task:1",
            "to": "tag:2",
        ])
        try store.upsertJoinRow(relationKey: "join_tasks_tags_tags", row: [
            "from": "task:1",
            "to": "tag:1",
        ])

        #expect(
            try store.listJoinRows(relationKey: "join_tasks_tags_tags").map { $0["to"]?.stringValue ?? "" }
                == ["tag:1", "tag:2"]
        )
        #expect(
            try store.getJoinRows(relationKey: "join_tasks_tags_tags", fromId: "task:1").count == 2
        )
        #expect(
            try store.getJoinRowsInverse(relationKey: "join_tasks_tags_tags", toId: "tag:1").map { $0["from"]?.stringValue ?? "" }
                == ["task:1"]
        )

        try store.setCursor(resource: "tasks", cursor: "cursor-1")
        #expect(try store.getCursor(resource: "tasks") == "cursor-1")
        try store.setHydrationState(resource: "tasks", state: .hydrating)
        try store.setHydrationState(resource: "tasks", state: .ready)
        #expect(try store.getHydrationState(resource: "tasks") == .ready)

        let entry = try store.changelogAppend(
            entry: DatafnChangelogPendingEntry(
                clientId: "d2",
                mutationId: "m2",
                mutation: ["op": "insert"],
                timestampMs: 2,
                actorId: "user-2",
                timestamp: "2026-03-27T12:00:00.000Z"
            )
        )
        #expect(try store.changelogList(limit: 10) == [entry])

        #expect(try store.findRecords(resource: "tasks", field: "status", value: "open").count == 1)
        #expect(try store.countRecords(resource: "tasks") == 1)
        #expect(try store.countJoinRows(relationKey: "join_tasks_tags_tags") == 2)

        try store.changelogAck(throughSeq: entry.seq)
        #expect(try store.changelogList(limit: 10).isEmpty)

        try store.deleteJoinRow(relationKey: "join_tasks_tags_tags", from: "task:1", to: "tag:1")
        #expect(try store.countJoinRows(relationKey: "join_tasks_tags_tags") == 1)
        try store.deleteRecord(resource: "tasks", id: "task:1")
        #expect(try store.getRecord(resource: "tasks", id: "task:1") == nil)

        try store.clearAll()
        #expect(try store.listRecords(resource: "tasks").isEmpty)
        #expect(store.healthCheck().ok)

        store.close()
        #expect(!store.healthCheck().ok)
    }

    @Test("TV-STO-002: Ordering and namespace isolation stay deterministic")
    func orderingAndNamespaceIsolationStayDeterministic() throws {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let locator = NamespaceStoreLocator()

        let namespaceALocation = try locator.locate(namespace: "org-1:user-1", under: rootURL)
        let namespaceBLocation = try locator.locate(namespace: "org-1:user-2", under: rootURL)

        let storeAWriter = try makeStore(
            namespace: "org-1:user-1",
            storeURL: namespaceALocation.storeURL
        )
        let storeAReader = try makeStore(
            namespace: "org-1:user-1",
            storeURL: namespaceALocation.storeURL
        )
        let storeB = try makeStore(
            namespace: "org-1:user-2",
            storeURL: namespaceBLocation.storeURL
        )

        try storeAWriter.upsertRecord(resource: "tasks", record: ["id": "task:2"])
        try storeAWriter.upsertRecord(resource: "tasks", record: ["id": "task:1"])
        try storeB.upsertRecord(resource: "tasks", record: ["id": "task:1"])
        try storeAWriter.upsertJoinRow(relationKey: "join_tasks_tags_tags", row: [
            "from": "task:2",
            "to": "tag:2",
        ])
        try storeAWriter.upsertJoinRow(relationKey: "join_tasks_tags_tags", row: [
            "from": "task:1",
            "to": "tag:1",
        ])

        #expect(
            try storeAReader.listRecords(resource: "tasks").map { $0["id"]?.stringValue ?? "" }
                == ["task:1", "task:2"]
        )
        #expect(
            try storeB.listRecords(resource: "tasks").map { $0["id"]?.stringValue ?? "" }
                == ["task:1"]
        )
        #expect(
            try storeAReader.listJoinRows(relationKey: "join_tasks_tags_tags").map {
                "\($0["from"]?.stringValue ?? ""):\($0["to"]?.stringValue ?? "")"
            } == ["task:1:tag:1", "task:2:tag:2"]
        )
        #expect(try storeB.getRecord(resource: "tasks", id: "task:2") == nil)
    }

    private func makeStore(
        namespace: String,
        storeURL: URL? = nil
    ) throws -> DatafnCoreDataStore {
        let storeRootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let resolvedStoreURL = storeURL ?? storeRootURL.appendingPathComponent("datafn.sqlite")

        return try DatafnCoreDataStore(
            configuration: DatafnCoreDataStoreConfiguration(
                schema: makeSchema(),
                schemaHash: "abc123",
                namespace: namespace,
                clientID: "device-1",
                backendKind: "datafn-server",
                storeURL: resolvedStoreURL
            )
        )
    }

    private func makeSchema() -> DatafnRuntimeSchema {
        DatafnRuntimeSchema(
            resources: [
                .init(
                    name: "tasks",
                    version: 1,
                    fields: [
                        .init(name: "title", type: "string"),
                        .init(name: "status", type: "string"),
                    ]
                ),
                .init(
                    name: "tags",
                    version: 1,
                    fields: [
                        .init(name: "label", type: "string"),
                    ]
                ),
            ],
            relations: [
                .init(
                    from: "tasks",
                    to: .single("tags"),
                    type: .manyMany,
                    name: "tags",
                    inverse: "tasks"
                )
            ]
        )
    }
}
