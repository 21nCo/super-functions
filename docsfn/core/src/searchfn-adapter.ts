import { compareSearchIdentity } from "./search-order";
import { createDiagnostic, createDocsError } from "./diagnostics";
import type { DocsSearchArtifact, DocsSearchDocument } from "./search";
import type { DocsSearchRuntimeResultItem } from "./search-runtime";
import type {
  DocsSearchEngineAdapter,
  DocsSearchIndexEngine,
  DocsSearchRuntimeBackend,
  DocsSearchRuntimeBackendQueryInput,
} from "./search-adapter";

const SEARCHFN_PIPELINE = {
  enableEdgeNGrams: true,
  edgeNGramMinLength: 2,
  edgeNGramMaxLength: 128,
};

interface SnapshotSearchEngine extends DocsSearchIndexEngine {
  importSnapshot(snapshot: DocsSearchArtifact["snapshot"]): void;
  searchDetailed(
    query: string,
    options: {
      fields?: string[];
      limit?: number;
      compareEqualScores?: (left: { docId: string | number; score: number }, right: { docId: string | number; score: number }) => number;
    }
  ): Array<{ docId: string | number; score: number }>;
}

interface SearchFnClientModule {
  InMemorySearchFn: new (options: {
    fields: string[];
    pipeline?: {
      enableEdgeNGrams?: boolean;
      edgeNGramMinLength?: number;
      edgeNGramMaxLength?: number;
    };
  }) => SnapshotSearchEngine;
}

async function loadSearchFnClient(
  usage: "build" | "runtime"
): Promise<SearchFnClientModule> {
  try {
    return (await import("@searchfn/client")) as unknown as SearchFnClientModule;
  } catch (error) {
    const code =
      usage === "build" ? "DOCS_SEARCH_BUILD_FAILED" : "DOCS_ARTIFACT_INVALID";
    const action = usage === "build" ? "build a docs search index" : "query a docs search artifact";
    throw createDocsError({
      code,
      message: `@searchfn/client is required to ${action}`,
      diagnostics: [
        createDiagnostic({
          code,
          message: `@searchfn/client is required to ${action}`,
          suggestion:
            usage === "build"
              ? "Install @searchfn/client, disable docs search, or provide a prebuilt search artifact."
              : "Install @searchfn/client or avoid creating the docs search runtime on pages that do not use search.",
        }),
      ],
      cause: error,
    });
  }
}

class SearchFnRuntimeBackend implements DocsSearchRuntimeBackend {
  constructor(
    private readonly artifact: DocsSearchArtifact,
    private readonly documents: Map<string, DocsSearchDocument>,
    private readonly engine: SnapshotSearchEngine,
    private readonly createEngine: () => SnapshotSearchEngine,
  ) {}

  private readonly scopeEngines = new Map<string, SnapshotSearchEngine>();

  private engineForScope(scope: string): SnapshotSearchEngine {
    if (scope === "all") return this.engine;
    let scoped = this.scopeEngines.get(scope);
    if (!scoped) {
      scoped = this.createEngine();
      const ids = new Set([...this.documents.values()].filter(document => document.scope === scope).map(document => document.id));
      // Filter the serialized index, preserving legacy artifacts whose body text
      // exists only in postings. Build once per scope, never per keystroke.
      const postings = this.artifact.snapshot.postings.map(bucket => ({ ...bucket,
        documents: bucket.documents.filter(document => ids.has(String(document.docId))),
      })).filter(bucket => bucket.documents.length > 0);
      const terms = new Set(postings.map(bucket => bucket.term));
      scoped.importSnapshot({ ...this.artifact.snapshot, postings,
        stats: this.artifact.snapshot.stats.filter(document => ids.has(String(document.docId))),
        documents: this.artifact.snapshot.documents.filter(document => ids.has(String(document.docId))),
        vocabulary: this.artifact.snapshot.vocabulary.filter(term => terms.has(term)),
      });
      this.scopeEngines.set(scope, scoped);
    }
    return scoped;
  }

  async query(
    input: DocsSearchRuntimeBackendQueryInput
  ): Promise<DocsSearchRuntimeResultItem[]> {
    const engineResults = this.engineForScope(input.scope).searchDetailed(input.query, {
      fields: this.artifact.fields,
      limit: input.limit,
      compareEqualScores: (left, right) => {
        const a = this.documents.get(String(left.docId));
        const b = this.documents.get(String(right.docId));
        return a && b ? compareSearchIdentity(a, b) : String(left.docId).localeCompare(String(right.docId));
      },
    });

    return engineResults
      .map((hit) => {
        const document = this.documents.get(String(hit.docId));
        if (!document) {
          return null;
        }
        return {
          id: document.id,
          score: hit.score,
          scope: document.scope,
          kind: document.kind,
          path: document.path,
          title: document.title,
          summary: document.summary,
        };
      })
      .filter((item): item is DocsSearchRuntimeResultItem => item !== null)
      .filter((item) => item.path.length > 0 && item.title.length > 0)
      .filter((item) => input.scope === "all" || item.scope === input.scope);
  }
}

export const searchFnSearchAdapter: DocsSearchEngineAdapter = {
  name: "searchfn",
  async createIndexEngine(input) {
    const { InMemorySearchFn } = await loadSearchFnClient("build");
    return new InMemorySearchFn({
      fields: input.fields,
      pipeline: SEARCHFN_PIPELINE,
    });
  },
  async createRuntime(input) {
    const { InMemorySearchFn } = await loadSearchFnClient("runtime");
    const engine = new InMemorySearchFn({
      fields: input.artifact.fields,
      pipeline: SEARCHFN_PIPELINE,
    });
    engine.importSnapshot(input.artifact.snapshot);
    return new SearchFnRuntimeBackend(input.artifact, input.documents, engine, () => new InMemorySearchFn({ fields: input.artifact.fields, pipeline: SEARCHFN_PIPELINE }));
  },
};
