import Foundation
#if canImport(ImageIO)
import ImageIO
#endif
#if canImport(UniformTypeIdentifiers)
import UniformTypeIdentifiers
#endif

public struct FileFnHEICPreprocessor: FileFnUploadPreprocessor {
    public typealias Transcoder = @Sendable (_ inputURL: URL, _ outputURL: URL, _ quality: Double) throws -> Void

    public let isEnabled: Bool
    public let compressionQuality: Double

    let transcoder: Transcoder

    public init(
        isEnabled: Bool = true,
        compressionQuality: Double = 0.82
    ) {
        self.init(
            isEnabled: isEnabled,
            compressionQuality: compressionQuality,
            transcoder: { inputURL, outputURL, quality in
                try Self.defaultTranscoder(inputURL: inputURL, outputURL: outputURL, quality: quality)
            }
        )
    }

    init(
        isEnabled: Bool = true,
        compressionQuality: Double = 0.82,
        transcoder: @escaping Transcoder
    ) {
        self.isEnabled = isEnabled
        self.compressionQuality = compressionQuality
        self.transcoder = transcoder
    }

    public func prepare(_ upload: FileFnPreparedUpload) async throws -> FileFnPreparedUpload {
        guard isEnabled, shouldConvert(upload) else {
            return upload
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(fileFnGenerateRandomIdentifier(prefix: "filefn_heic"))
            .appendingPathExtension("jpg")

        do {
            try transcoder(upload.fileURL, outputURL, compressionQuality)
            let values = try outputURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard values.isRegularFile == true else {
                throw FileFnClientError.preprocessingFailed(
                    code: "FILEFN_HEIC_CONVERSION_FAILED",
                    message: "HEIC preprocessing did not produce a regular JPEG file"
                )
            }

            var metadata = upload.metadata ?? [:]
            if metadata["originalMimeType"] == nil {
                metadata["originalMimeType"] = .string(upload.mimeType)
            }

            return upload.replacing(
                fileURL: outputURL,
                fileName: fileFnJPEGFileName(from: upload.fileName),
                mimeType: "image/jpeg",
                metadata: metadata,
                fileSize: Int64(values.fileSize ?? 0),
                cleanupFileURL: outputURL
            )
        } catch let error as FileFnClientError {
            try? FileManager.default.removeItem(at: outputURL)
            throw error
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            throw FileFnClientError.preprocessingFailed(
                code: "FILEFN_HEIC_CONVERSION_FAILED",
                message: "HEIC preprocessing failed: \(error.localizedDescription)"
            )
        }
    }

    private func shouldConvert(_ upload: FileFnPreparedUpload) -> Bool {
        let mimeType = upload.mimeType.lowercased()
        if mimeType == "image/heic" || mimeType == "image/heif" {
            return true
        }

        let fileExtension = upload.fileURL.pathExtension.isEmpty
            ? URL(fileURLWithPath: upload.fileName).pathExtension
            : upload.fileURL.pathExtension
        return ["heic", "heif"].contains(fileExtension.lowercased())
    }

    private static func defaultTranscoder(inputURL: URL, outputURL: URL, quality: Double) throws {
        #if canImport(ImageIO) && canImport(UniformTypeIdentifiers)
        guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let destination = CGImageDestinationCreateWithURL(
                  outputURL as CFURL,
                  UTType.jpeg.identifier as CFString,
                  1,
                  nil
              )
        else {
            throw FileFnClientError.preprocessingFailed(
                code: "FILEFN_HEIC_CONVERSION_FAILED",
                message: "Unable to initialize HEIC transcoder"
            )
        }

        let options = [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
        CGImageDestinationAddImage(destination, image, options)
        guard CGImageDestinationFinalize(destination) else {
            throw FileFnClientError.preprocessingFailed(
                code: "FILEFN_HEIC_CONVERSION_FAILED",
                message: "Unable to finalize JPEG output"
            )
        }
        #else
        throw FileFnClientError.preprocessingFailed(
            code: "FILEFN_HEIC_CONVERSION_FAILED",
            message: "HEIC preprocessing is unavailable on this platform"
        )
        #endif
    }
}

private func fileFnJPEGFileName(from fileName: String) -> String {
    let url = URL(fileURLWithPath: fileName)
    let basename = url.deletingPathExtension().lastPathComponent
    if basename.isEmpty {
        return "upload.jpg"
    }
    return "\(basename).jpg"
}
