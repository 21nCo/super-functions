import Foundation
import SearchFnAdapterContracts

public struct SearchFnCoreSearchRequest: Sendable, Equatable {
    public let query: String
    public let fields: [String]?
    public let limit: Int?
    public let fuzzy: SearchFnFuzzyOption?
    public let prefix: Bool
    public let fieldBoosts: [String: Double]

    public init(
        query: String,
        fields: [String]? = nil,
        limit: Int? = nil,
        fuzzy: SearchFnFuzzyOption? = nil,
        prefix: Bool = false,
        fieldBoosts: [String: Double] = [:]
    ) {
        self.query = query
        self.fields = fields
        self.limit = limit
        self.fuzzy = fuzzy
        self.prefix = prefix
        self.fieldBoosts = fieldBoosts
    }
}

public final class SearchFnResourceEngine {
    private struct PostingInfo {
        let frequency: Int
        let metadata: SearchFnTokenMetadata?
    }

    private struct QueryTerm {
        let field: String
        let term: String
        let boost: Double
    }

    private let configuredSearchFields: [String]
    private let pipeline: SearchFnPipelineEngine

    private var postings: [String: [String: PostingInfo]] = [:]
    private var documentLengths: [String: Int] = [:]
    private var documentPostingKeys: [String: Set<String>] = [:]
    private var documentVocabularyTerms: [String: Set<String>] = [:]
    private var vocabularyCounts: [String: Int] = [:]
    private var totalDocumentLength = 0

    public init(
        searchFields: [String],
        pipelineOptions: SearchFnPipelineOptions = SearchFnPipelineOptions()
    ) {
        self.configuredSearchFields = Array(Set(searchFields)).sorted()
        self.pipeline = SearchFnPipelineEngine(options: pipelineOptions)
    }

    public func analyze(field: String, text: String, documentID: String? = nil) -> [SearchFnToken] {
        pipeline.run(field: field, text: text, documentID: documentID)
    }

    public func upsert(_ documents: [SearchFnDocument]) {
        for document in documents {
            remove(ids: [document.id])
            index(document: document)
        }
    }

    public func remove(ids: [String]) {
        for id in Set(ids) {
            remove(documentID: id)
        }
    }

    public func clear() {
        postings.removeAll()
        documentLengths.removeAll()
        documentPostingKeys.removeAll()
        documentVocabularyTerms.removeAll()
        vocabularyCounts.removeAll()
        totalDocumentLength = 0
    }

    public func search(_ request: SearchFnCoreSearchRequest) throws -> [SearchFnScoredDocument] {
        let trimmedQuery = request.query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            throw SearchFnError(
                code: "DFQL_INVALID",
                message: "Search query must not be empty",
                details: SearchFnErrorDetails(path: "query")
            )
        }

        let selectedFields = (request.fields?.isEmpty == false ? request.fields : configuredSearchFields) ?? []
        guard !selectedFields.isEmpty else {
            return []
        }

        let fuzzyDistance = try resolvedFuzzyDistance(request.fuzzy)
        let terms = buildQueryTerms(
            query: trimmedQuery,
            fields: selectedFields,
            fuzzyDistance: fuzzyDistance,
            prefix: request.prefix
        )

        guard !terms.isEmpty else {
            return []
        }

        var chunks: [SearchFnPostingChunk] = []
        for term in terms {
            let key = postingKey(field: term.field, term: term.term)
            guard let postingMap = postings[key] else {
                continue
            }

            let fieldBoost = request.fieldBoosts[term.field] ?? 1.0
            let chunkPostings = postingMap.keys.sorted().compactMap { documentID -> SearchFnPosting? in
                guard let info = postingMap[documentID] else {
                    return nil
                }
                return SearchFnPosting(
                    documentID: documentID,
                    termFrequency: Double(info.frequency) * term.boost * fieldBoost,
                    metadata: info.metadata
                )
            }

            if !chunkPostings.isEmpty {
                chunks.append(
                    SearchFnPostingChunk(
                        field: term.field,
                        term: term.term,
                        postings: chunkPostings,
                        documentFrequency: chunkPostings.count
                    )
                )
            }
        }

        guard !chunks.isEmpty else {
            return []
        }

        let averageLength = documentLengths.isEmpty ? 1.0 : Double(totalDocumentLength) / Double(documentLengths.count)
        let scored = searchFnScorePostings(
            chunks,
            documentLengths: documentLengths,
            averageDocumentLength: averageLength
        )
        let limit = max(0, request.limit ?? 10)
        return Array(scored.prefix(limit))
    }

    public var vocabulary: Set<String> {
        Set(vocabularyCounts.keys)
    }

    private func index(document: SearchFnDocument) {
        var allPostingKeys: Set<String> = []
        var allVocabularyTerms: Set<String> = []
        var totalLength = 0

        for field in configuredSearchFields {
            guard let value = document.fields[field], !value.isEmpty else {
                continue
            }

            let tokens = pipeline.run(field: field, text: value, documentID: document.id)
            guard !tokens.isEmpty else {
                continue
            }

            totalLength += tokens.count

            var termFrequencies: [String: Int] = [:]
            var termMetadata: [String: SearchFnTokenMetadata?] = [:]

            for token in tokens {
                termFrequencies[token.value, default: 0] += 1
                if termMetadata[token.value] == nil {
                    termMetadata[token.value] = token.metadata
                }
            }

            for term in termFrequencies.keys.sorted() {
                let key = postingKey(field: field, term: term)
                postings[key, default: [:]][document.id] = PostingInfo(
                    frequency: termFrequencies[term] ?? 1,
                    metadata: termMetadata[term] ?? nil
                )
                allPostingKeys.insert(key)
            }

            for term in Set(termFrequencies.keys).sorted() where termMetadata[term]??.isPrefix != true {
                vocabularyCounts[term, default: 0] += 1
                allVocabularyTerms.insert(term)
            }
        }

        guard totalLength > 0 else {
            return
        }

        documentLengths[document.id] = totalLength
        documentPostingKeys[document.id] = allPostingKeys
        documentVocabularyTerms[document.id] = allVocabularyTerms
        totalDocumentLength += totalLength
    }

    private func remove(documentID: String) {
        if let length = documentLengths.removeValue(forKey: documentID) {
            totalDocumentLength -= length
        }

        if let postingKeys = documentPostingKeys.removeValue(forKey: documentID) {
            for key in postingKeys {
                postings[key]?[documentID] = nil
                if postings[key]?.isEmpty == true {
                    postings[key] = nil
                }
            }
        }

        if let vocabularyTerms = documentVocabularyTerms.removeValue(forKey: documentID) {
            for term in vocabularyTerms {
                if let count = vocabularyCounts[term] {
                    if count <= 1 {
                        vocabularyCounts[term] = nil
                    } else {
                        vocabularyCounts[term] = count - 1
                    }
                }
            }
        }
    }

    private func buildQueryTerms(
        query: String,
        fields: [String],
        fuzzyDistance: Int?,
        prefix: Bool
    ) -> [QueryTerm] {
        var resolvedTerms: [String: QueryTerm] = [:]

        for field in fields {
            let tokens = pipeline.run(field: field, text: query)
                .filter { $0.metadata?.isPrefix != true }

            for token in tokens {
                if prefix {
                    for vocabularyTerm in vocabulary where vocabularyTerm.hasPrefix(token.value) {
                        let boost = vocabularyTerm == token.value ? 1.0 : 0.9
                        upsertQueryTerm(
                            QueryTerm(field: field, term: vocabularyTerm, boost: boost),
                            into: &resolvedTerms
                        )
                    }
                } else {
                    upsertQueryTerm(QueryTerm(field: field, term: token.value, boost: 1.0), into: &resolvedTerms)
                }

                if let fuzzyDistance {
                    for term in searchFnFuzzyExpand(term: token.value, maxDistance: fuzzyDistance, vocabulary: vocabulary) {
                        let boost = term == token.value ? 1.0 : 0.8
                        upsertQueryTerm(
                            QueryTerm(field: field, term: term, boost: boost),
                            into: &resolvedTerms
                        )
                    }
                }
            }
        }

        return resolvedTerms.values.sorted { lhs, rhs in
            if lhs.field != rhs.field {
                return lhs.field < rhs.field
            }
            if lhs.term != rhs.term {
                return lhs.term < rhs.term
            }
            return lhs.boost > rhs.boost
        }
    }

    private func upsertQueryTerm(_ queryTerm: QueryTerm, into terms: inout [String: QueryTerm]) {
        let key = postingKey(field: queryTerm.field, term: queryTerm.term)
        if let existing = terms[key], existing.boost >= queryTerm.boost {
            return
        }
        terms[key] = queryTerm
    }

    private func postingKey(field: String, term: String) -> String {
        "\(field)::\(term)"
    }

    private func resolvedFuzzyDistance(_ fuzzy: SearchFnFuzzyOption?) throws -> Int? {
        switch fuzzy {
        case nil, .disabled:
            return nil
        case .enabled:
            return 2
        case .distance(let distance):
            guard (1...3).contains(distance) else {
                throw SearchFnError(
                    code: "DFQL_INVALID",
                    message: "fuzzy distance must be between 1 and 3",
                    details: SearchFnErrorDetails(path: "fuzzy")
                )
            }
            return distance
        }
    }
}
