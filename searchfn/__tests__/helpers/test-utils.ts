import { afterEach } from "vitest";
import {
  type AddDocumentInput,
  type SearchFnOptions,
  SearchFn
} from "../../src/search-engine";

type TestEngineOptions = Partial<SearchFnOptions>;

const engines = new Set<SearchFn>();

export function createTestEngine(options: TestEngineOptions = {}): SearchFn {
  const engine = new SearchFn({
    name: options.name ?? `test-${Math.random().toString(36).slice(2)}`,
    fields: options.fields ?? ["body"],
    pipeline: options.pipeline,
    storage: options.storage,
    cache: options.cache
  });

  engines.add(engine);
  return engine;
}

export async function createEngineWithDocuments(
  documents: AddDocumentInput[],
  options: TestEngineOptions = {}
): Promise<SearchFn> {
  const engine = createTestEngine(options);
  for (const document of documents) {
    await engine.add(document);
  }
  return engine;
}

export function unregisterEngine(engine: SearchFn): void {
  engines.delete(engine);
}

export async function destroyTestEngine(engine: SearchFn): Promise<void> {
  unregisterEngine(engine);
  await engine.destroy();
}

async function destroyAllTestEngines(): Promise<void> {
  await Promise.all(Array.from(engines).map((engine) => engine.destroy()));
  engines.clear();
}

afterEach(async () => {
  await destroyAllTestEngines();
});
