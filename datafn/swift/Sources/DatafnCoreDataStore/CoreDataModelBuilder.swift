import CoreData
import Foundation

public struct DatafnRuntimeSchema: Codable, Sendable, Equatable {
    public struct Resource: Codable, Sendable, Equatable {
        public struct Indices: Codable, Sendable, Equatable {
            public let base: [String]
            public let search: [String]
            public let vector: [String]

            public init(
                base: [String] = [],
                search: [String] = [],
                vector: [String] = []
            ) {
                self.base = base
                self.search = search
                self.vector = vector
            }

            public init(from decoder: Decoder) throws {
                let container = try decoder.singleValueContainer()
                if let shorthand = try? container.decode([String].self) {
                    self = Self(base: shorthand, search: [], vector: [])
                    return
                }

                let object = try container.decode(StructuredIndices.self)
                self = Self(
                    base: object.base ?? [],
                    search: object.search ?? [],
                    vector: object.vector ?? []
                )
            }

            public func encode(to encoder: Encoder) throws {
                var container = encoder.singleValueContainer()
                try container.encode(
                    StructuredIndices(
                        base: base,
                        search: search,
                        vector: vector
                    )
                )
            }

            private struct StructuredIndices: Codable, Sendable, Equatable {
                let base: [String]?
                let search: [String]?
                let vector: [String]?
            }
        }

        public struct Field: Codable, Sendable, Equatable {
            public let name: String
            public let type: String
            public let required: Bool?

            public init(name: String, type: String, required: Bool? = nil) {
                self.name = name
                self.type = type
                self.required = required
            }
        }

        public let name: String
        public let version: Int
        public let fields: [Field]
        public let indices: Indices?
        public let isRemoteOnly: Bool?

        public init(
            name: String,
            version: Int,
            fields: [Field],
            indices: Indices? = nil,
            isRemoteOnly: Bool? = nil
        ) {
            self.name = name
            self.version = version
            self.fields = fields
            self.indices = indices
            self.isRemoteOnly = isRemoteOnly
        }
    }

    public struct Relation: Codable, Sendable, Equatable {
        public enum Kind: String, Codable, Sendable, Equatable {
            case oneOne = "one-one"
            case oneMany = "one-many"
            case manyOne = "many-one"
            case manyMany = "many-many"
        }

        public enum Destination: Codable, Sendable, Equatable {
            case single(String)
            case multiple([String])

            public init(from decoder: Decoder) throws {
                let container = try decoder.singleValueContainer()
                if let single = try? container.decode(String.self) {
                    self = .single(single)
                    return
                }

                self = .multiple(try container.decode([String].self))
            }

            public func encode(to encoder: Encoder) throws {
                var container = encoder.singleValueContainer()
                switch self {
                case .single(let value):
                    try container.encode(value)
                case .multiple(let values):
                    try container.encode(values)
                }
            }

            public var values: [String] {
                switch self {
                case .single(let value):
                    return [value]
                case .multiple(let values):
                    return values
                }
            }
        }

        public let from: String
        public let to: Destination
        public let type: Kind
        public let name: String
        public let inverse: String?

        enum CodingKeys: String, CodingKey {
            case from
            case to
            case type
            case name = "relation"
            case inverse
        }

        public init(
            from: String,
            to: Destination,
            type: Kind,
            name: String,
            inverse: String? = nil
        ) {
            self.from = from
            self.to = to
            self.type = type
            self.name = name
            self.inverse = inverse
        }
    }

    public let resources: [Resource]
    public let relations: [Relation]

    public init(resources: [Resource], relations: [Relation] = []) {
        self.resources = resources
        self.relations = relations
    }

    public static func decode(from data: Data) throws -> DatafnRuntimeSchema {
        let decoder = JSONDecoder()
        return try decoder.decode(DatafnRuntimeSchema.self, from: data)
    }
}

public enum DatafnRuntimeSchemaError: Error, Equatable {
    case emptyResources
    case duplicateResource(String)
    case invalidResourceName
}

extension DatafnRuntimeSchema {
    public func validate() throws {
        guard !resources.isEmpty else {
            throw DatafnRuntimeSchemaError.emptyResources
        }

        var names = Set<String>()
        for resource in resources {
            let trimmedName = resource.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedName.isEmpty {
                throw DatafnRuntimeSchemaError.invalidResourceName
            }

            if !names.insert(trimmedName).inserted {
                throw DatafnRuntimeSchemaError.duplicateResource(trimmedName)
            }
        }
    }
}

public struct CoreDataModelBuilder {
    public struct BuildOptions: Sendable, Equatable {
        public let cloudKitCompatible: Bool

        public init(cloudKitCompatible: Bool = false) {
            self.cloudKitCompatible = cloudKitCompatible
        }

        public static let `default` = Self()
        public static let cloudKit = Self(cloudKitCompatible: true)
    }

    public struct EntityNames: Sendable, Equatable {
        public let resourceEntities: [String]
        public let joinEntities: [String]
        public let builtInEntities: [String]

        public init(
            resourceEntities: [String],
            joinEntities: [String],
            builtInEntities: [String]
        ) {
            self.resourceEntities = resourceEntities
            self.joinEntities = joinEntities
            self.builtInEntities = builtInEntities
        }
    }

    public init() {}

    public func buildModel(
        from schema: DatafnRuntimeSchema,
        options: BuildOptions = .default
    ) throws -> NSManagedObjectModel {
        try schema.validate()

        let model = NSManagedObjectModel()
        var entities: [NSEntityDescription] = []

        let resourceEntities = schema.resources
            .filter { $0.isRemoteOnly != true }
            .sorted { $0.name < $1.name }
            .map { makeResourceEntity(for: $0, options: options) }
        entities.append(contentsOf: resourceEntities)

        let joinEntities = schema.relations
            .filter { $0.type == .manyMany }
            .flatMap { makeJoinEntities(for: $0, options: options) }
            .sorted { ($0.name ?? "") < ($1.name ?? "") }
        entities.append(contentsOf: joinEntities)

        entities.append(contentsOf: makeBuiltInEntities(options: options))
        model.entities = entities
        return model
    }

    public func generatedEntityNames(from schema: DatafnRuntimeSchema) throws -> EntityNames {
        try schema.validate()

        let resourceEntities = schema.resources
            .filter { $0.isRemoteOnly != true }
            .sorted { $0.name < $1.name }
            .map { resourceEntityName(for: $0.name) }
        let joinEntities = schema.relations
            .filter { $0.type == .manyMany }
            .flatMap { relation in
                relation.to.values.map { joinEntityName(from: relation.from, relation: relation.name, to: $0) }
            }
            .sorted()

        return EntityNames(
            resourceEntities: resourceEntities,
            joinEntities: joinEntities,
            builtInEntities: builtInEntityNames
        )
    }

    private func makeResourceEntity(
        for resource: DatafnRuntimeSchema.Resource,
        options: BuildOptions
    ) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = resourceEntityName(for: resource.name)
        entity.managedObjectClassName = "NSManagedObject"
        entity.properties = [
            makeStringAttribute(
                name: "id",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeIntegerAttribute(
                name: "version",
                optional: false,
                defaultValue: options.cloudKitCompatible ? 0 : nil
            ),
            makeBinaryAttribute(
                name: "recordData",
                optional: false,
                defaultValue: options.cloudKitCompatible ? Data() : nil
            ),
        ]
        if !options.cloudKitCompatible {
            entity.uniquenessConstraints = [["id"]]
        }
        return entity
    }

    private func makeJoinEntities(
        for relation: DatafnRuntimeSchema.Relation,
        options: BuildOptions
    ) -> [NSEntityDescription] {
        relation.to.values.map { target in
            let entity = NSEntityDescription()
            entity.name = joinEntityName(from: relation.from, relation: relation.name, to: target)
            entity.managedObjectClassName = "NSManagedObject"
            entity.properties = [
                makeStringAttribute(
                    name: "fromID",
                    optional: false,
                    indexed: true,
                    defaultValue: options.cloudKitCompatible ? "" : nil
                ),
                makeStringAttribute(
                    name: "toID",
                    optional: false,
                    indexed: true,
                    defaultValue: options.cloudKitCompatible ? "" : nil
                ),
                makeBinaryAttribute(name: "relationData", optional: true),
            ]
            if !options.cloudKitCompatible {
                entity.uniquenessConstraints = [["fromID", "toID"]]
            }
            return entity
        }
    }

    private func makeBuiltInEntities(options: BuildOptions) -> [NSEntityDescription] {
        [
            makeKVEntity(options: options),
            makeCursorEntity(options: options),
            makeHydrationEntity(options: options),
            makeNamespaceMetadataEntity(options: options),
            makeChangelogEntity(options: options),
        ]
    }

    private func makeKVEntity(options: BuildOptions) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = "df_kv_entry"
        entity.managedObjectClassName = "NSManagedObject"
        entity.properties = [
            makeStringAttribute(
                name: "key",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeBinaryAttribute(name: "valueData", optional: true),
        ]
        if !options.cloudKitCompatible {
            entity.uniquenessConstraints = [["key"]]
        }
        return entity
    }

    private func makeCursorEntity(options: BuildOptions) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = "df_cursor_state"
        entity.managedObjectClassName = "NSManagedObject"
        entity.properties = [
            makeStringAttribute(
                name: "resourceName",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(name: "cursorValue", optional: true),
            makeDateAttribute(
                name: "updatedAt",
                optional: false,
                defaultValue: options.cloudKitCompatible
                    ? Date(timeIntervalSince1970: 0)
                    : nil
            ),
        ]
        if !options.cloudKitCompatible {
            entity.uniquenessConstraints = [["resourceName"]]
        }
        return entity
    }

    private func makeHydrationEntity(options: BuildOptions) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = "df_hydration_state"
        entity.managedObjectClassName = "NSManagedObject"
        entity.properties = [
            makeStringAttribute(
                name: "resourceName",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(
                name: "state",
                optional: false,
                defaultValue: options.cloudKitCompatible
                    ? DatafnHydrationState.notStarted.rawValue
                    : nil
            ),
            makeDateAttribute(
                name: "updatedAt",
                optional: false,
                defaultValue: options.cloudKitCompatible
                    ? Date(timeIntervalSince1970: 0)
                    : nil
            ),
        ]
        if !options.cloudKitCompatible {
            entity.uniquenessConstraints = [["resourceName"]]
        }
        return entity
    }

    private func makeNamespaceMetadataEntity(options: BuildOptions) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = "df_namespace_metadata"
        entity.managedObjectClassName = "NSManagedObject"
        entity.properties = [
            makeStringAttribute(
                name: "namespace",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(
                name: "schemaHash",
                optional: false,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(
                name: "clientID",
                optional: false,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(
                name: "backendKind",
                optional: false,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(
                name: "searchBackendKind",
                optional: true
            ),
            makeStringAttribute(
                name: "searchSchemaHash",
                optional: true
            ),
            makeStringAttribute(
                name: "searchConfigDigest",
                optional: true
            ),
            makeStringAttribute(
                name: "searchStatus",
                optional: false,
                defaultValue: options.cloudKitCompatible ? "unavailable" : nil
            ),
            makeIntegerAttribute(name: "lastChangelogSequence", optional: false, defaultValue: 0),
        ]
        if !options.cloudKitCompatible {
            entity.uniquenessConstraints = [["namespace"]]
        }
        return entity
    }

    private func makeChangelogEntity(options: BuildOptions) -> NSEntityDescription {
        let entity = NSEntityDescription()
        entity.name = "df_changelog_entry"
        entity.managedObjectClassName = "NSManagedObject"
        entity.properties = [
            makeIntegerAttribute(
                name: "sequence",
                optional: false,
                defaultValue: options.cloudKitCompatible ? 0 : nil
            ),
            makeStringAttribute(
                name: "clientID",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeStringAttribute(
                name: "mutationID",
                optional: false,
                indexed: true,
                defaultValue: options.cloudKitCompatible ? "" : nil
            ),
            makeBinaryAttribute(
                name: "mutationData",
                optional: false,
                defaultValue: options.cloudKitCompatible ? Data() : nil
            ),
            makeIntegerAttribute(
                name: "timestampMS",
                optional: false,
                defaultValue: options.cloudKitCompatible ? 0 : nil
            ),
            makeStringAttribute(name: "timestampISO8601", optional: true),
            makeStringAttribute(name: "actorID", optional: true),
        ]
        if !options.cloudKitCompatible {
            entity.uniquenessConstraints = [["clientID", "mutationID"]]
        }
        return entity
    }

    private func makeStringAttribute(
        name: String,
        optional: Bool,
        indexed _: Bool = false,
        defaultValue: String? = nil
    ) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = .stringAttributeType
        attribute.isOptional = optional
        attribute.defaultValue = defaultValue
        return attribute
    }

    private func makeIntegerAttribute(
        name: String,
        optional: Bool,
        defaultValue: NSNumber? = nil
    ) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = .integer64AttributeType
        attribute.isOptional = optional
        attribute.defaultValue = defaultValue
        return attribute
    }

    private func makeBinaryAttribute(
        name: String,
        optional: Bool,
        defaultValue: Data? = nil
    ) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = .binaryDataAttributeType
        attribute.isOptional = optional
        attribute.defaultValue = defaultValue
        attribute.allowsExternalBinaryDataStorage = true
        return attribute
    }

    private func makeDateAttribute(
        name: String,
        optional: Bool,
        defaultValue: Date? = nil
    ) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = .dateAttributeType
        attribute.isOptional = optional
        attribute.defaultValue = defaultValue
        return attribute
    }

    private func resourceEntityName(for resourceName: String) -> String {
        "df_record_\(sanitize(resourceName))"
    }

    private func joinEntityName(from source: String, relation: String, to destination: String) -> String {
        "df_join_\(sanitize(source))_\(sanitize(relation))_\(sanitize(destination))"
    }

    private func sanitize(_ raw: String) -> String {
        let sanitized = raw.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) {
                return Character(String(scalar).lowercased())
            }

            return "_"
        }

        return String(sanitized)
            .replacingOccurrences(of: "__+", with: "_", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    }

    private var builtInEntityNames: [String] {
        [
            "df_kv_entry",
            "df_cursor_state",
            "df_hydration_state",
            "df_namespace_metadata",
            "df_changelog_entry",
        ]
    }
}
