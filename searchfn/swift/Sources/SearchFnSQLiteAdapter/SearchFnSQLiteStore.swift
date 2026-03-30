import Foundation
import SQLite3
import SearchFnAdapterContracts

private let searchFnSQLiteSchemaVersion = 1
private let searchFnSQLiteManifestFormat = "searchfn-swift/v1"
private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

internal struct SearchFnSQLiteLayout: Equatable {
    let directoryURL: URL
    let databaseURL: URL
    let manifestURL: URL

    init(configuration: SearchFnSQLiteAdapterConfiguration) {
        let directoryName = Self.directoryName(for: configuration.indexKey)
        let directoryURL = configuration.rootURL.appendingPathComponent(directoryName, isDirectory: true)
        self.directoryURL = directoryURL
        self.databaseURL = directoryURL.appendingPathComponent("searchfn.sqlite", isDirectory: false)
        self.manifestURL = directoryURL.appendingPathComponent("manifest.json", isDirectory: false)
    }

    static func directoryName(for indexKey: String) -> String {
        let slug = slugify(indexKey)
        return "\(slug)-\(fnv1a64Hex(indexKey))"
    }

    private static func slugify(_ value: String) -> String {
        var scalars: [UnicodeScalar] = []
        var lastWasSeparator = false

        for scalar in value.lowercased().unicodeScalars {
            if CharacterSet.alphanumerics.contains(scalar) {
                scalars.append(scalar)
                lastWasSeparator = false
            } else if !lastWasSeparator {
                scalars.append("-")
                lastWasSeparator = true
            }
        }

        let slug = String(String.UnicodeScalarView(scalars)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return slug.isEmpty ? "index" : slug
    }

    private static func fnv1a64Hex(_ value: String) -> String {
        let prime: UInt64 = 1_099_511_628_211
        var hash: UInt64 = 14_695_981_039_346_656_037

        for byte in value.utf8 {
            hash ^= UInt64(byte)
            hash &*= prime
        }

        let hex = String(hash, radix: 16, uppercase: false)
        return String(repeating: "0", count: max(0, 16 - hex.count)) + hex
    }
}

internal struct SearchFnSQLiteManifest: Codable, Equatable {
    let format: String
    let indexKey: String
    let sqliteSchemaVersion: Int
}

internal enum SearchFnSQLiteOpenMode {
    case created
    case reopened
}

internal struct SearchFnSQLitePostingRecord {
    let field: String
    let term: String
    let documentID: String
    let frequency: Int
    let isPrefix: Bool
    let originalTerm: String?
}

internal struct SearchFnSQLiteDocumentRecord {
    let document: SearchFnDocument
    let totalLength: Int
    let postings: [SearchFnSQLitePostingRecord]
    let vocabularyTerms: [String]
}

internal final class SearchFnSQLiteStore {
    private let configuration: SearchFnSQLiteAdapterConfiguration
    let layout: SearchFnSQLiteLayout
    let openMode: SearchFnSQLiteOpenMode
    let schemaVersion = searchFnSQLiteSchemaVersion
    private let fileManager = FileManager.default
    private var database: OpaquePointer?

    init(configuration: SearchFnSQLiteAdapterConfiguration) throws {
        self.configuration = configuration
        self.layout = SearchFnSQLiteLayout(configuration: configuration)

        let manifestExists = fileManager.fileExists(atPath: layout.manifestURL.path)
        let databaseExists = fileManager.fileExists(atPath: layout.databaseURL.path)
        if manifestExists != databaseExists {
            throw Self.formatMismatchError()
        }

        self.openMode = manifestExists ? .reopened : .created

        try fileManager.createDirectory(at: layout.directoryURL, withIntermediateDirectories: true)
        self.database = try Self.openDatabase(at: layout.databaseURL)

        if manifestExists {
            try validateExistingStore()
        } else {
            try createFreshStore()
        }
    }

    deinit {
        if let database {
            sqlite3_close(database)
        }
    }

    func close() {
        if let database {
            sqlite3_close(database)
            self.database = nil
        }
    }

    func loadResourceConfigurations() throws -> [String: SearchFnInitializeResourceConfig] {
        let statement = try prepare(
            """
            SELECT resource, search_fields_json
            FROM resource_configs
            ORDER BY resource ASC
            """
        )
        defer { sqlite3_finalize(statement) }

        var configs: [String: SearchFnInitializeResourceConfig] = [:]
        while sqlite3_step(statement) == SQLITE_ROW {
            let resource = try string(at: 0, from: statement)
            let searchFieldsJSON = try string(at: 1, from: statement)
            let searchFields = try decode([String].self, from: searchFieldsJSON)
            configs[resource] = SearchFnInitializeResourceConfig(name: resource, searchFields: searchFields)
        }

        return configs
    }

    func loadDocuments(resource: String) throws -> [SearchFnDocument] {
        let statement = try prepare(
            """
            SELECT doc_id, fields_json
            FROM documents
            WHERE resource = ?
            ORDER BY doc_id ASC
            """
        )
        defer { sqlite3_finalize(statement) }

        bind(resource, at: 1, in: statement)

        var documents: [SearchFnDocument] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            let id = try string(at: 0, from: statement)
            let fieldsJSON = try string(at: 1, from: statement)
            let fields = try decode([String: String].self, from: fieldsJSON)
            documents.append(SearchFnDocument(id: id, fields: fields))
        }

        return documents
    }

    func upsertResourceConfiguration(_ config: SearchFnInitializeResourceConfig) throws {
        let searchFieldsJSON = try encode(config.searchFields)
        let statement = try prepare(
            """
            INSERT INTO resource_configs(resource, search_fields_json)
            VALUES(?, ?)
            ON CONFLICT(resource) DO UPDATE SET search_fields_json = excluded.search_fields_json
            """
        )
        defer { sqlite3_finalize(statement) }

        bind(config.name, at: 1, in: statement)
        bind(searchFieldsJSON, at: 2, in: statement)
        try stepExpectDone(statement)
    }

    func replaceDocument(resource: String, record: SearchFnSQLiteDocumentRecord) throws {
        try inTransaction {
            try removeDocumentData(resource: resource, documentID: record.document.id)

            guard record.totalLength > 0 else {
                return
            }

            let documentStatement = try prepare(
                """
                INSERT INTO documents(resource, doc_id, fields_json, total_length)
                VALUES(?, ?, ?, ?)
                """
            )
            defer { sqlite3_finalize(documentStatement) }

            bind(resource, at: 1, in: documentStatement)
            bind(record.document.id, at: 2, in: documentStatement)
            bind(try encode(record.document.fields), at: 3, in: documentStatement)
            bind(record.totalLength, at: 4, in: documentStatement)
            try stepExpectDone(documentStatement)

            let postingStatement = try prepare(
                """
                INSERT INTO postings(resource, field, term, doc_id, frequency, is_prefix, original_term)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """
            )
            defer { sqlite3_finalize(postingStatement) }

            for posting in record.postings {
                sqlite3_reset(postingStatement)
                sqlite3_clear_bindings(postingStatement)
                bind(resource, at: 1, in: postingStatement)
                bind(posting.field, at: 2, in: postingStatement)
                bind(posting.term, at: 3, in: postingStatement)
                bind(posting.documentID, at: 4, in: postingStatement)
                bind(posting.frequency, at: 5, in: postingStatement)
                bind(posting.isPrefix ? 1 : 0, at: 6, in: postingStatement)
                bind(posting.originalTerm, at: 7, in: postingStatement)
                try stepExpectDone(postingStatement)
            }

            let vocabularyStatement = try prepare(
                """
                INSERT INTO vocabulary(resource, term, doc_count)
                VALUES(?, ?, 1)
                ON CONFLICT(resource, term) DO UPDATE SET doc_count = doc_count + 1
                """
            )
            defer { sqlite3_finalize(vocabularyStatement) }

            for term in record.vocabularyTerms {
                sqlite3_reset(vocabularyStatement)
                sqlite3_clear_bindings(vocabularyStatement)
                bind(resource, at: 1, in: vocabularyStatement)
                bind(term, at: 2, in: vocabularyStatement)
                try stepExpectDone(vocabularyStatement)
            }
        }
    }

    func removeDocuments(resource: String, ids: [String]) throws {
        try inTransaction {
            for id in Set(ids) {
                try removeDocumentData(resource: resource, documentID: id)
            }
        }
    }

    func clearResource(resource: String) throws {
        try inTransaction {
            for table in ["postings", "vocabulary", "documents", "resource_configs"] {
                let statement = try prepare("DELETE FROM \(table) WHERE resource = ?")
                defer { sqlite3_finalize(statement) }
                bind(resource, at: 1, in: statement)
                try stepExpectDone(statement)
            }
        }
    }

    private func validateExistingStore() throws {
        let manifestData = try Data(contentsOf: layout.manifestURL)
        let manifest = try JSONDecoder().decode(SearchFnSQLiteManifest.self, from: manifestData)
        guard manifest.format == searchFnSQLiteManifestFormat,
              manifest.indexKey == configuration.indexKey,
              manifest.sqliteSchemaVersion == searchFnSQLiteSchemaVersion else {
            throw Self.formatMismatchError()
        }

        let schemaVersion = try currentSchemaVersion()
        guard schemaVersion == searchFnSQLiteSchemaVersion else {
            throw Self.formatMismatchError()
        }

        let expectedTables = Set(["resource_configs", "documents", "postings", "vocabulary"])
        let statement = try prepare(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            """
        )
        defer { sqlite3_finalize(statement) }

        var discoveredTables = Set<String>()
        while sqlite3_step(statement) == SQLITE_ROW {
            discoveredTables.insert(try string(at: 0, from: statement))
        }

        guard expectedTables.isSubset(of: discoveredTables) else {
            throw Self.formatMismatchError()
        }
    }

    private func createFreshStore() throws {
        try execute("PRAGMA journal_mode = WAL")
        try execute(
            """
            CREATE TABLE IF NOT EXISTS resource_configs(
                resource TEXT PRIMARY KEY,
                search_fields_json TEXT NOT NULL
            )
            """
        )
        try execute(
            """
            CREATE TABLE IF NOT EXISTS documents(
                resource TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                fields_json TEXT NOT NULL,
                total_length INTEGER NOT NULL,
                PRIMARY KEY(resource, doc_id)
            )
            """
        )
        try execute(
            """
            CREATE TABLE IF NOT EXISTS postings(
                resource TEXT NOT NULL,
                field TEXT NOT NULL,
                term TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                frequency INTEGER NOT NULL,
                is_prefix INTEGER NOT NULL,
                original_term TEXT,
                PRIMARY KEY(resource, field, term, doc_id)
            )
            """
        )
        try execute(
            """
            CREATE INDEX IF NOT EXISTS postings_lookup_idx
            ON postings(resource, field, term)
            """
        )
        try execute(
            """
            CREATE TABLE IF NOT EXISTS vocabulary(
                resource TEXT NOT NULL,
                term TEXT NOT NULL,
                doc_count INTEGER NOT NULL,
                PRIMARY KEY(resource, term)
            )
            """
        )
        try execute("PRAGMA user_version = \(searchFnSQLiteSchemaVersion)")

        let manifest = SearchFnSQLiteManifest(
            format: searchFnSQLiteManifestFormat,
            indexKey: configuration.indexKey,
            sqliteSchemaVersion: searchFnSQLiteSchemaVersion
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .prettyPrinted]
        let data = try encoder.encode(manifest)
        try data.write(to: layout.manifestURL, options: .atomic)
    }

    private func currentSchemaVersion() throws -> Int {
        let statement = try prepare("PRAGMA user_version")
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else {
            throw SearchFnError.internalError("Failed to read SQLite schema version")
        }
        return Int(sqlite3_column_int(statement, 0))
    }

    private func removeDocumentData(resource: String, documentID: String) throws {
        let vocabularyTerms = try fetchVocabularyTerms(resource: resource, documentID: documentID)

        let deletePostings = try prepare(
            """
            DELETE FROM postings
            WHERE resource = ? AND doc_id = ?
            """
        )
        defer { sqlite3_finalize(deletePostings) }
        bind(resource, at: 1, in: deletePostings)
        bind(documentID, at: 2, in: deletePostings)
        try stepExpectDone(deletePostings)

        let deleteDocument = try prepare(
            """
            DELETE FROM documents
            WHERE resource = ? AND doc_id = ?
            """
        )
        defer { sqlite3_finalize(deleteDocument) }
        bind(resource, at: 1, in: deleteDocument)
        bind(documentID, at: 2, in: deleteDocument)
        try stepExpectDone(deleteDocument)

        let decrementVocabulary = try prepare(
            """
            UPDATE vocabulary
            SET doc_count = doc_count - 1
            WHERE resource = ? AND term = ?
            """
        )
        let deleteEmptyVocabulary = try prepare(
            """
            DELETE FROM vocabulary
            WHERE resource = ? AND term = ? AND doc_count <= 0
            """
        )
        defer {
            sqlite3_finalize(decrementVocabulary)
            sqlite3_finalize(deleteEmptyVocabulary)
        }

        for term in vocabularyTerms {
            sqlite3_reset(decrementVocabulary)
            sqlite3_clear_bindings(decrementVocabulary)
            bind(resource, at: 1, in: decrementVocabulary)
            bind(term, at: 2, in: decrementVocabulary)
            try stepExpectDone(decrementVocabulary)

            sqlite3_reset(deleteEmptyVocabulary)
            sqlite3_clear_bindings(deleteEmptyVocabulary)
            bind(resource, at: 1, in: deleteEmptyVocabulary)
            bind(term, at: 2, in: deleteEmptyVocabulary)
            try stepExpectDone(deleteEmptyVocabulary)
        }
    }

    private func fetchVocabularyTerms(resource: String, documentID: String) throws -> [String] {
        let statement = try prepare(
            """
            SELECT term
            FROM postings
            WHERE resource = ? AND doc_id = ? AND is_prefix = 0
            GROUP BY term
            ORDER BY term ASC
            """
        )
        defer { sqlite3_finalize(statement) }

        bind(resource, at: 1, in: statement)
        bind(documentID, at: 2, in: statement)

        var terms: [String] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            terms.append(try string(at: 0, from: statement))
        }
        return terms
    }

    private func inTransaction(_ operation: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE TRANSACTION")
        do {
            try operation()
            try execute("COMMIT")
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        guard let database else {
            throw SearchFnError.disposed()
        }

        var statement: OpaquePointer?
        let result = sqlite3_prepare_v2(database, sql, -1, &statement, nil)
        guard result == SQLITE_OK, let statement else {
            throw Self.sqliteError(from: database)
        }
        return statement
    }

    private func execute(_ sql: String) throws {
        guard let database else {
            throw SearchFnError.disposed()
        }

        let result = sqlite3_exec(database, sql, nil, nil, nil)
        guard result == SQLITE_OK else {
            throw Self.sqliteError(from: database)
        }
    }

    private func stepExpectDone(_ statement: OpaquePointer) throws {
        guard sqlite3_step(statement) == SQLITE_DONE else {
            throw Self.sqliteError(from: database)
        }
    }

    private func bind(_ value: String, at index: Int32, in statement: OpaquePointer) {
        sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
    }

    private func bind(_ value: String?, at index: Int32, in statement: OpaquePointer) {
        guard let value else {
            sqlite3_bind_null(statement, index)
            return
        }
        bind(value, at: index, in: statement)
    }

    private func bind(_ value: Int, at index: Int32, in statement: OpaquePointer) {
        sqlite3_bind_int64(statement, index, sqlite3_int64(value))
    }

    private func string(at index: Int32, from statement: OpaquePointer) throws -> String {
        guard let text = sqlite3_column_text(statement, index) else {
            throw SearchFnError.internalError("Unexpected null SQLite text column")
        }
        return String(cString: text)
    }

    private func encode<T: Encodable>(_ value: T) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(value)
        guard let string = String(data: data, encoding: .utf8) else {
            throw SearchFnError.internalError("Failed to encode JSON payload")
        }
        return string
    }

    private func decode<T: Decodable>(_ type: T.Type, from string: String) throws -> T {
        let decoder = JSONDecoder()
        guard let data = string.data(using: .utf8) else {
            throw SearchFnError.internalError("Failed to decode JSON payload")
        }
        return try decoder.decode(type, from: data)
    }

    private static func openDatabase(at url: URL) throws -> OpaquePointer {
        var database: OpaquePointer?
        let result = sqlite3_open_v2(
            url.path,
            &database,
            SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
            nil
        )

        guard result == SQLITE_OK, let database else {
            if let database {
                let message = String(cString: sqlite3_errmsg(database))
                sqlite3_close(database)
                throw SearchFnError.internalError("SQLite open failed: \(message)")
            }
            throw SearchFnError.internalError("SQLite open failed")
        }

        return database
    }

    private static func sqliteError(from database: OpaquePointer?) -> SearchFnError {
        guard let database else {
            return SearchFnError.internalError("SQLite operation failed")
        }
        return SearchFnError.internalError(
            "SQLite operation failed: \(String(cString: sqlite3_errmsg(database)))"
        )
    }

    private static func formatMismatchError() -> SearchFnError {
        SearchFnError(
            code: SEARCH_INDEX_FORMAT_MISMATCH,
            message: "Persisted SearchFn index format does not match runtime expectations"
        )
    }
}

internal enum SearchFnSQLiteTestSupport {
    static func makeConfiguration(indexKey: String) -> SearchFnSQLiteAdapterConfiguration {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("searchfn-swift-tests-\(UUID().uuidString)", isDirectory: true)
        return SearchFnSQLiteAdapterConfiguration(rootURL: rootURL, indexKey: indexKey)
    }

    static func cleanup(_ configuration: SearchFnSQLiteAdapterConfiguration) {
        try? FileManager.default.removeItem(at: configuration.rootURL)
    }

    static func databaseExists(for layout: SearchFnSQLiteLayout) -> Bool {
        FileManager.default.fileExists(atPath: layout.databaseURL.path)
    }

    static func manifestExists(for layout: SearchFnSQLiteLayout) -> Bool {
        FileManager.default.fileExists(atPath: layout.manifestURL.path)
    }

    static func databaseFileName(for layout: SearchFnSQLiteLayout) -> String {
        layout.databaseURL.lastPathComponent
    }

    static func directoryName(for layout: SearchFnSQLiteLayout) -> String {
        layout.directoryURL.lastPathComponent
    }

    static func readManifest(for layout: SearchFnSQLiteLayout) throws -> SearchFnSQLiteManifest {
        try JSONDecoder().decode(SearchFnSQLiteManifest.self, from: Data(contentsOf: layout.manifestURL))
    }

    static func writeManifest(_ manifest: SearchFnSQLiteManifest, for layout: SearchFnSQLiteLayout) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(manifest).write(to: layout.manifestURL, options: .atomic)
    }
}
