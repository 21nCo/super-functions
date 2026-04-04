import Foundation

public actor FileFnFileSystemUploadStateStore: FileFnUploadStateStore {
    private let rootDirectory: URL
    private let snapshotsDirectory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(rootDirectory: URL) {
        self.rootDirectory = rootDirectory
        self.snapshotsDirectory = rootDirectory.appendingPathComponent("snapshots", isDirectory: true)
        self.encoder = JSONEncoder()
        self.decoder = JSONDecoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    public func loadSnapshots() async throws -> [FileFnBackgroundUploadSnapshot] {
        try ensureDirectories()
        let fileURLs = try FileManager.default.contentsOfDirectory(
            at: snapshotsDirectory,
            includingPropertiesForKeys: nil
        )
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }

        return try fileURLs.map { fileURL in
            let data = try Data(contentsOf: fileURL)
            return try decoder.decode(FileFnBackgroundUploadSnapshot.self, from: data)
        }
    }

    public func loadSnapshot(uploadID: String) async throws -> FileFnBackgroundUploadSnapshot? {
        try ensureDirectories()
        let fileURL = snapshotURL(uploadID: uploadID)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return nil
        }
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode(FileFnBackgroundUploadSnapshot.self, from: data)
    }

    public func saveSnapshot(_ snapshot: FileFnBackgroundUploadSnapshot) async throws {
        try ensureDirectories()
        let data = try encoder.encode(snapshot)
        try data.write(to: snapshotURL(uploadID: snapshot.uploadID), options: .atomic)
    }

    public func deleteSnapshot(uploadID: String) async throws {
        try ensureDirectories()
        let fileURL = snapshotURL(uploadID: uploadID)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return
        }
        try FileManager.default.removeItem(at: fileURL)
    }

    private func ensureDirectories() throws {
        try FileManager.default.createDirectory(at: rootDirectory, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: snapshotsDirectory, withIntermediateDirectories: true)
    }

    private func snapshotURL(uploadID: String) -> URL {
        snapshotsDirectory.appendingPathComponent("\(safeSnapshotComponent(for: uploadID)).json", isDirectory: false)
    }

    private func safeSnapshotComponent(for uploadID: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        let encoded = uploadID.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        return encoded.isEmpty ? "_upload" : encoded
    }
}
