import Foundation

public protocol FileFnUploadStateStore: Sendable {
    func loadSnapshots() async throws -> [FileFnBackgroundUploadSnapshot]
    func loadSnapshot(uploadID: String) async throws -> FileFnBackgroundUploadSnapshot?
    func saveSnapshot(_ snapshot: FileFnBackgroundUploadSnapshot) async throws
    func deleteSnapshot(uploadID: String) async throws
}
