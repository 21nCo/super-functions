import CoreData
import Testing
@testable import DatafnCoreDataStore

@Suite("CoreData model builder")
struct CoreDataModelBuilderTests {
    @Test("Model builder generates resource, join, and built-in entity families")
    func modelBuilderGeneratesResourceJoinAndBuiltInEntityFamilies() throws {
        let builder = CoreDataModelBuilder()
        let schema = makeSchema()

        let entityNames = try builder.generatedEntityNames(from: schema)
        let model = try builder.buildModel(from: schema)
        let modelEntityNames = Set(model.entities.compactMap(\.name))

        #expect(entityNames.resourceEntities == ["df_record_tags", "df_record_tasks"])
        #expect(entityNames.joinEntities == ["df_join_tasks_tags_tags"])
        #expect(
            entityNames.builtInEntities == [
                "df_kv_entry",
                "df_cursor_state",
                "df_hydration_state",
                "df_namespace_metadata",
                "df_changelog_entry",
            ]
        )
        #expect(
            modelEntityNames
                == Set(
                    entityNames.resourceEntities
                        + entityNames.joinEntities
                        + entityNames.builtInEntities
                )
        )
        #expect(!modelEntityNames.contains("df_record_auditlogs"))
    }

    @Test("Generated entities include deterministic constraints for storage semantics")
    func generatedEntitiesHaveExpectedShapeAndConstraints() throws {
        let builder = CoreDataModelBuilder()
        let model = try builder.buildModel(from: makeSchema())

        let changelog = try #require(model.entitiesByName["df_changelog_entry"])
        #expect(changelog.uniquenessConstraints.count == 1)
        #expect(changelog.uniquenessConstraints.first as? [String] == ["clientID", "mutationID"])

        let taskEntity = try #require(model.entitiesByName["df_record_tasks"])
        #expect(taskEntity.attributesByName["id"] != nil)
        #expect(taskEntity.attributesByName["version"] != nil)
        #expect(taskEntity.attributesByName["recordData"] != nil)
        #expect(taskEntity.uniquenessConstraints.first as? [String] == ["id"])

        let joinEntity = try #require(model.entitiesByName["df_join_tasks_tags_tags"])
        #expect(joinEntity.attributesByName["fromID"] != nil)
        #expect(joinEntity.attributesByName["toID"] != nil)
        #expect(joinEntity.uniquenessConstraints.first as? [String] == ["fromID", "toID"])
    }

    @Test("Namespace locator is deterministic and isolated per namespace")
    func namespaceLocatorIsDeterministicAndIsolatedPerNamespace() throws {
        let locator = NamespaceStoreLocator()
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)

        let namespaceALocation1 = try locator.locate(namespace: "org-1:user-1", under: rootURL)
        let namespaceALocation2 = try locator.locate(namespace: "org-1:user-1", under: rootURL)
        let namespaceBLocation = try locator.locate(namespace: "org-1:user-2", under: rootURL)

        #expect(namespaceALocation1 == namespaceALocation2)
        #expect(namespaceALocation1.storeURL.lastPathComponent == "datafn.sqlite")
        #expect(namespaceALocation1.directoryURL != namespaceBLocation.directoryURL)
        #expect(namespaceALocation1.changeTrackingDomain != namespaceBLocation.changeTrackingDomain)
    }

    private func makeSchema() -> DatafnRuntimeSchema {
        DatafnRuntimeSchema(
            resources: [
                .init(
                    name: "tasks",
                    version: 1,
                    fields: [
                        .init(name: "title", type: "string"),
                    ]
                ),
                .init(
                    name: "tags",
                    version: 1,
                    fields: [
                        .init(name: "label", type: "string"),
                    ]
                ),
                .init(
                    name: "auditLogs",
                    version: 1,
                    fields: [
                        .init(name: "kind", type: "string"),
                    ],
                    isRemoteOnly: true
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
