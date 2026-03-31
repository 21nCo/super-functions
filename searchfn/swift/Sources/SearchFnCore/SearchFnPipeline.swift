import Foundation
import SearchFnAdapterContracts

public struct SearchFnTokenMetadata: Sendable, Equatable, Codable {
    public let isPrefix: Bool
    public let originalTerm: String?

    public init(isPrefix: Bool, originalTerm: String?) {
        self.isPrefix = isPrefix
        self.originalTerm = originalTerm
    }
}

public struct SearchFnToken: Sendable, Equatable, Codable {
    public let value: String
    public let position: Int
    public let field: String
    public let documentID: String?
    public let metadata: SearchFnTokenMetadata?

    public init(
        value: String,
        position: Int,
        field: String,
        documentID: String?,
        metadata: SearchFnTokenMetadata? = nil
    ) {
        self.value = value
        self.position = position
        self.field = field
        self.documentID = documentID
        self.metadata = metadata
    }
}

public struct SearchFnPipelineEngine: Sendable {
    public static let defaultMinPrefixLength = 2
    public static let defaultMaxPrefixLength = 15

    private static let tokenExpression = try! NSRegularExpression(pattern: #"[\p{L}\p{N}]+"#)

    public let options: SearchFnPipelineOptions

    public init(options: SearchFnPipelineOptions = SearchFnPipelineOptions()) {
        self.options = options
    }

    public func run(field: String, text: String, documentID: String? = nil) -> [SearchFnToken] {
        let baseTokens = tokenize(field: field, text: text, documentID: documentID)
            .map { token in
                SearchFnToken(
                    value: token.value.lowercased(),
                    position: token.position,
                    field: token.field,
                    documentID: token.documentID,
                    metadata: token.metadata
                )
            }
            .filter { !stopWords.contains($0.value) }
            .map { token in
                guard options.enableStemming else { return token }
                return SearchFnToken(
                    value: stemmer.stem(token.value),
                    position: token.position,
                    field: token.field,
                    documentID: token.documentID,
                    metadata: token.metadata
                )
            }

        guard options.enablePrefixIndexing else {
            return baseTokens
        }

        return generatePrefixTokens(from: baseTokens)
    }

    private var stopWords: Set<String> {
        if let customStopWords = options.customStopWords {
            return customStopWords
        }

        switch options.language {
        case .english:
            return searchFnStopWordsEnglish
        case .spanish:
            return searchFnStopWordsSpanish
        case .french:
            return searchFnStopWordsFrench
        }
    }

    private var stemmer: any SearchFnStemmer {
        makeStemmer(for: options.language)
    }

    private func tokenize(field: String, text: String, documentID: String?) -> [SearchFnToken] {
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = Self.tokenExpression.matches(in: text, range: range)
        var tokens: [SearchFnToken] = []
        var currentValue = ""
        var currentStart: Int?
        var previousEnd: Int?

        func flushToken() {
            guard let start = currentStart, !currentValue.isEmpty else { return }
            tokens.append(
                SearchFnToken(
                    value: currentValue,
                    position: start,
                    field: field,
                    documentID: documentID
                )
            )
            currentValue = ""
            currentStart = nil
            previousEnd = nil
        }

        for match in matches {
            guard let stringRange = Range(match.range, in: text) else {
                continue
            }

            let tokenPart = String(text[stringRange])
            let location = match.range.location

            if let previousEnd, location != previousEnd + 1 {
                flushToken()
            }

            if currentStart == nil {
                currentStart = location
            }

            currentValue.append(tokenPart)
            previousEnd = match.range.location + match.range.length - 1
        }

        flushToken()
        return tokens
    }

    private func generatePrefixTokens(from tokens: [SearchFnToken]) -> [SearchFnToken] {
        var result: [SearchFnToken] = []

        for token in tokens {
            if token.value.count < Self.defaultMinPrefixLength {
                result.append(token)
                continue
            }

            let maxLength = min(token.value.count, Self.defaultMaxPrefixLength)
            for length in Self.defaultMinPrefixLength...maxLength {
                let prefix = String(token.value.prefix(length))
                result.append(
                    SearchFnToken(
                        value: prefix,
                        position: token.position,
                        field: token.field,
                        documentID: token.documentID,
                        metadata: SearchFnTokenMetadata(
                            isPrefix: length < token.value.count,
                            originalTerm: token.value
                        )
                    )
                )
            }
        }

        return result
    }
}
