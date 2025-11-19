import { performance } from "node:perf_hooks";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { SearchFn } from "../src/search-engine";
import { createDocumentsFromFlexStore } from "../src/compat/migration";

const globalObject = globalThis as unknown as {
  indexedDB: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
};
globalObject.indexedDB = indexedDB;
globalObject.IDBKeyRange = IDBKeyRange as unknown as typeof globalObject.IDBKeyRange;

interface BenchmarkReport {
  addDuration: number;
  searchDuration: number;
  documents: number;
  queries: number;
}

function createSampleStore(size: number): Record<string, Record<string, unknown>> {
  const store: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < size; i += 1) {
    const id = `doc-${i}`;
    store[id] = {
      title: `Sample title ${i}`,
      body: `Document ${i} contains ${(i % 5 === 0 ? "IndexedDB cache" : "searchfn benchmark")} text for evaluation`,
      tags: ["search", "benchmark", i % 2 === 0 ? "even" : "odd"]
    };
  }
  return store;
}

async function runBenchmark(size = 1000): Promise<BenchmarkReport> {
  const engine = new SearchFn({
    name: `benchmark-${Math.random().toString(16).slice(2)}`,
    fields: ["title", "body"]
  });

  const { documents } = createDocumentsFromFlexStore(createSampleStore(size), {
    indexFields: ["title", "body"],
    storeFields: ["tags"]
  });

  const addStart = performance.now();
  for (const document of documents) {
    // eslint-disable-next-line no-await-in-loop
    await engine.add(document);
  }
  const addDuration = performance.now() - addStart;

  const queries = ["benchmark", "IndexedDB", "Document", "missing term"];
  const searchStart = performance.now();
  for (const query of queries) {
    // eslint-disable-next-line no-await-in-loop
    await engine.search(query, { limit: 10 });
  }
  const searchDuration = performance.now() - searchStart;

  await engine.destroy();

  return {
    addDuration,
    searchDuration,
    documents: documents.length,
    queries: queries.length
  };
}

async function main() {
  const size = Number.parseInt(process.argv[2] ?? "1000", 10);
  const report = await runBenchmark(size);
  console.log(
    JSON.stringify(
      {
        size: report.documents,
        addMs: report.addDuration.toFixed(2),
        avgAddPerDoc: (report.addDuration / report.documents).toFixed(4),
        searchMs: report.searchDuration.toFixed(2),
        avgSearchPerQuery: (report.searchDuration / report.queries).toFixed(4)
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
