import Testing
@testable import SearchFnAdapterContracts
@testable import SearchFnCore

@Test("pipeline tokenizes Unicode text and applies language stop words plus stemming")
func pipelineNormalizationAndStopWords() {
    let englishPipeline = SearchFnPipelineEngine(
        options: SearchFnPipelineOptions(language: .english, enableStemming: true)
    )
    let englishTokens = englishPipeline.run(
        field: "title",
        text: "Running with the robots"
    )
    #expect(englishTokens.map(\.value) == ["run", "robot"])

    let spanishPipeline = SearchFnPipelineEngine(
        options: SearchFnPipelineOptions(language: .spanish)
    )
    let spanishTokens = spanishPipeline.run(
        field: "title",
        text: "El rapido zorro"
    )
    #expect(spanishTokens.map(\.value) == ["rapido", "zorro"])

    let frenchPipeline = SearchFnPipelineEngine(
        options: SearchFnPipelineOptions(language: .french)
    )
    let frenchTokens = frenchPipeline.run(
        field: "title",
        text: "Le rapport et l'analyse"
    )
    #expect(frenchTokens.map(\.value) == ["rapport", "analyse"])
}

@Test("prefix indexing generates deterministic edge n-grams with metadata")
func prefixIndexingGeneratesExpectedTokens() {
    let pipeline = SearchFnPipelineEngine(
        options: SearchFnPipelineOptions(enablePrefixIndexing: true)
    )

    let tokens = pipeline.run(field: "title", text: "Report")

    #expect(tokens.map(\.value) == ["re", "rep", "repo", "repor", "report"])
    #expect(tokens.map { $0.metadata?.isPrefix } == [true, true, true, true, false])
    #expect(tokens.last?.metadata?.originalTerm == "report")
}

@Test("fuzzy expansion is capped to distance three and remains deterministic")
func fuzzyExpansionCappedToThree() {
    let vocabulary: Set<String> = ["report", "repot", "repotr", "reposting", "analysis"]
    let expanded = searchFnFuzzyExpand(term: "report", maxDistance: 99, vocabulary: vocabulary)

    #expect(expanded == ["report", "repot", "repotr"])
}

@Test("engine prefers exact matches over prefix and fuzzy-only matches")
func engineRanksExactPrefixAndFuzzyMatches() throws {
    let engine = SearchFnResourceEngine(
        searchFields: ["title", "body"],
        pipelineOptions: SearchFnPipelineOptions(language: .english, enablePrefixIndexing: true)
    )

    engine.upsert([
        SearchFnDocument(id: "a", fields: ["title": "report", "body": "weekly summary"]),
        SearchFnDocument(id: "b", fields: ["title": "reporting", "body": "finance"]),
        SearchFnDocument(id: "c", fields: ["title": "repotr", "body": "typo sample"]),
    ])

    let results = try engine.search(
        SearchFnCoreSearchRequest(
            query: "report",
            fuzzy: .enabled,
            prefix: true,
            fieldBoosts: ["title": 3.0]
        )
    )

    #expect(results.map { $0.id } == ["a", "b", "c"])
}

@Test("field boosts change ranking without breaking deterministic ordering")
func fieldBoostsAffectRanking() throws {
    let engine = SearchFnResourceEngine(
        searchFields: ["title", "body"],
        pipelineOptions: SearchFnPipelineOptions(language: .english, enablePrefixIndexing: true)
    )

    engine.upsert([
        SearchFnDocument(id: "a", fields: ["title": "budget", "body": "notes"]),
        SearchFnDocument(id: "b", fields: ["title": "notes", "body": "budget"]),
    ])

    let titleWeighted = try engine.search(
        SearchFnCoreSearchRequest(query: "budget", fieldBoosts: ["title": 3.0])
    )
    #expect(titleWeighted.map(\.id) == ["a", "b"])

    let bodyWeighted = try engine.search(
        SearchFnCoreSearchRequest(query: "budget", fieldBoosts: ["body": 5.0])
    )
    #expect(bodyWeighted.map(\.id) == ["b", "a"])
}

@Test("repeated identical queries preserve deterministic tie-break ordering")
func repeatedQueriesStayDeterministic() throws {
    let engine = SearchFnResourceEngine(
        searchFields: ["title"],
        pipelineOptions: SearchFnPipelineOptions(language: .english)
    )

    engine.upsert([
        SearchFnDocument(id: "a1", fields: ["title": "alert"]),
        SearchFnDocument(id: "a2", fields: ["title": "alert"]),
        SearchFnDocument(id: "a3", fields: ["title": "incident"]),
    ])

    let first = try engine.search(SearchFnCoreSearchRequest(query: "alert"))
    let second = try engine.search(SearchFnCoreSearchRequest(query: "alert"))

    #expect(first.map(\.id) == ["a1", "a2"])
    #expect(second.map(\.id) == ["a1", "a2"])
    #expect(first == second)
}

@Test("invalid fuzzy distances use canonical validation errors")
func invalidFuzzyDistanceThrowsCanonicalError() throws {
    let engine = SearchFnResourceEngine(
        searchFields: ["title"],
        pipelineOptions: SearchFnPipelineOptions(language: .english)
    )

    engine.upsert([
        SearchFnDocument(id: "a1", fields: ["title": "report"]),
    ])

    do {
        _ = try engine.search(
            SearchFnCoreSearchRequest(query: "report", fuzzy: .distance(0))
        )
        Issue.record("Expected invalid fuzzy distance to throw")
    } catch let error as SearchFnError {
        #expect(error.code == "DFQL_INVALID")
        #expect(error.message == "fuzzy distance must be between 1 and 3")
        #expect(error.details?.path == "fuzzy")
    }
}
