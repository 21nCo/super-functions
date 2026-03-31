import Foundation
import SearchFnAdapterContracts

public protocol SearchFnStemmer: Sendable {
    func stem(_ token: String) -> String
}

public struct SearchFnEnglishStemmer: SearchFnStemmer {
    public init() {}

    public func stem(_ token: String) -> String {
        var stemmed = token

        if stemmed.count > 4, stemmed.hasSuffix("ing") {
            stemmed.removeLast(3)

            if stemmed.count <= 4, stemmed.count >= 3 {
                let characters = Array(stemmed)
                let last = characters[characters.count - 1]
                let previous = characters[characters.count - 2]
                if last == previous, "bdfglmnprst".contains(last) {
                    stemmed.removeLast()
                }
            }
        } else if stemmed.count > 3, stemmed.hasSuffix("ed") {
            stemmed.removeLast(2)
        } else if stemmed.count > 2, stemmed.hasSuffix("s") {
            stemmed.removeLast()
        }

        return stemmed
    }
}

public struct SearchFnNoOpStemmer: SearchFnStemmer {
    public init() {}

    public func stem(_ token: String) -> String {
        token
    }
}

func makeStemmer(for language: SearchFnLanguage) -> any SearchFnStemmer {
    switch language {
    case .english:
        return SearchFnEnglishStemmer()
    case .spanish, .french:
        return SearchFnNoOpStemmer()
    }
}
