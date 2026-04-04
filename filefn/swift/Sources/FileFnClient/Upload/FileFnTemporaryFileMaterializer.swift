import Foundation

struct FileFnMaterializedUploadFile: Sendable, Equatable {
    let fileURL: URL
    let fileSize: Int64
    let fileName: String
    let isTemporary: Bool
}

enum FileFnTemporaryFileMaterializer {
    static func materialize(
        source: FileFnUploadSource,
        preferredFileName: String?
    ) throws -> FileFnMaterializedUploadFile {
        switch source {
        case .fileURL(let fileURL):
            return try materializeExistingFile(fileURL: fileURL, preferredFileName: preferredFileName)
        case .data(let data):
            return try materializeData(data, preferredFileName: preferredFileName)
        }
    }

    static func cleanup(_ file: FileFnMaterializedUploadFile) {
        guard file.isTemporary else {
            return
        }
        try? FileManager.default.removeItem(at: file.fileURL)
    }

    private static func materializeExistingFile(
        fileURL: URL,
        preferredFileName: String?
    ) throws -> FileFnMaterializedUploadFile {
        let values = try fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .nameKey])
        guard values.isRegularFile == true else {
            throw FileFnClientError.fileAccess(reason: "Upload source must be a regular file")
        }

        let fileSize = Int64(values.fileSize ?? 0)
        let fileName = preferredFileName ?? values.name ?? fileURL.lastPathComponent

        return FileFnMaterializedUploadFile(
            fileURL: fileURL,
            fileSize: fileSize,
            fileName: fileName.isEmpty ? "blob" : fileName,
            isTemporary: false
        )
    }

    private static func materializeData(
        _ data: Data,
        preferredFileName: String?
    ) throws -> FileFnMaterializedUploadFile {
        let fileName = {
            let candidate = preferredFileName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return candidate.isEmpty ? "blob" : candidate
        }()
        let directory = FileManager.default.temporaryDirectory
        let extensionSuffix = URL(fileURLWithPath: fileName).pathExtension
        let temporaryName: String
        if extensionSuffix.isEmpty {
            temporaryName = fileFnGenerateRandomIdentifier(prefix: "filefn_upload")
        } else {
            temporaryName = "\(fileFnGenerateRandomIdentifier(prefix: "filefn_upload")).\(extensionSuffix)"
        }

        let temporaryURL = directory.appendingPathComponent(temporaryName, isDirectory: false)
        do {
            try data.write(to: temporaryURL, options: .atomic)
        } catch {
            throw FileFnClientError.fileAccess(reason: "Unable to materialize Data upload source: \(error.localizedDescription)")
        }

        return FileFnMaterializedUploadFile(
            fileURL: temporaryURL,
            fileSize: Int64(data.count),
            fileName: fileName,
            isTemporary: true
        )
    }
}
