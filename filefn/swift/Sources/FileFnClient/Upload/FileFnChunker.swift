import Foundation

struct FileFnUploadChunk: Sendable, Equatable {
    let partNumber: Int
    let offset: UInt64
    let size: Int
}

struct FileFnChunker: Sendable {
    let fileSize: Int64
    let chunkSizeBytes: Int

    init(fileSize: Int64, chunkSizeBytes: Int) {
        self.fileSize = fileSize
        self.chunkSizeBytes = chunkSizeBytes
    }

    func chunks() -> [FileFnUploadChunk] {
        guard fileSize >= 0 else {
            return []
        }

        let safeChunkSize = max(chunkSizeBytes, 1)
        if fileSize == 0 {
            return [FileFnUploadChunk(partNumber: 1, offset: 0, size: 0)]
        }

        var chunks: [FileFnUploadChunk] = []
        var partNumber = 1
        var offset: Int64 = 0

        while offset < fileSize {
            let remaining = fileSize - offset
            let size = Int(min(Int64(safeChunkSize), remaining))
            chunks.append(
                FileFnUploadChunk(
                    partNumber: partNumber,
                    offset: UInt64(offset),
                    size: size
                )
            )
            offset += Int64(size)
            partNumber += 1
        }

        return chunks
    }

    static func readChunk(from fileURL: URL, chunk: FileFnUploadChunk) throws -> Data {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }

        try handle.seek(toOffset: chunk.offset)
        let data = try handle.read(upToCount: chunk.size) ?? Data()
        guard data.count == chunk.size else {
            throw FileFnClientError.fileAccess(
                reason: "Expected \(chunk.size) bytes for part \(chunk.partNumber), received \(data.count)"
            )
        }
        return data
    }
}
