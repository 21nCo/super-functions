import Foundation

public struct SearchFnPosting: Sendable, Equatable {
    public let documentID: String
    public let termFrequency: Double
    public let metadata: SearchFnTokenMetadata?

    public init(documentID: String, termFrequency: Double, metadata: SearchFnTokenMetadata? = nil) {
        self.documentID = documentID
        self.termFrequency = termFrequency
        self.metadata = metadata
    }
}

public struct SearchFnPostingChunk: Sendable, Equatable {
    public let field: String
    public let term: String
    public let postings: [SearchFnPosting]
    public let documentFrequency: Int
    public let inverseDocumentFrequency: Double?

    public init(
        field: String,
        term: String,
        postings: [SearchFnPosting],
        documentFrequency: Int,
        inverseDocumentFrequency: Double? = nil
    ) {
        self.field = field
        self.term = term
        self.postings = postings
        self.documentFrequency = documentFrequency
        self.inverseDocumentFrequency = inverseDocumentFrequency
    }
}

public struct SearchFnScoredDocument: Sendable, Equatable {
    public let id: String
    public let score: Double

    public init(id: String, score: Double) {
        self.id = id
        self.score = score
    }
}

public enum SearchFnDeterministicSort: Sendable {
    public static func searchResults(_ lhs: SearchFnScoredDocument, _ rhs: SearchFnScoredDocument) -> Bool {
        if lhs.score != rhs.score {
            return lhs.score > rhs.score
        }
        return lhs.id < rhs.id
    }
}

public func searchFnScorePostings(
    _ chunks: [SearchFnPostingChunk],
    documentLengths: [String: Int],
    averageDocumentLength: Double,
    k1: Double = 1.2,
    b: Double = 0.75,
    d: Double = 0.5
) -> [SearchFnScoredDocument] {
    let normalizedAverage = max(averageDocumentLength, 1.0)
    var scores: [String: Double] = [:]

    for chunk in chunks {
        let idf = chunk.inverseDocumentFrequency ?? log(1.0 + 1.0 / max(Double(chunk.documentFrequency), 1.0))

        for posting in chunk.postings {
            let documentLength = Double(documentLengths[posting.documentID] ?? Int(normalizedAverage))
            let normalizedLength = 1.0 - b + (b * documentLength) / normalizedAverage
            let denominator = (k1 * normalizedLength) + posting.termFrequency
            var contribution = idf * (d + (((k1 + 1.0) * posting.termFrequency) / max(denominator, 0.000_001)))

            if posting.metadata?.isPrefix == true {
                contribution *= 0.7
            }

            scores[posting.documentID, default: 0.0] += contribution
        }
    }

    return scores
        .map { SearchFnScoredDocument(id: $0.key, score: $0.value) }
        .sorted(by: SearchFnDeterministicSort.searchResults)
}
