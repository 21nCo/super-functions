import Foundation

public enum FileFnUploadSource: Sendable, Equatable {
    case fileURL(URL)
    case data(Data)
}
