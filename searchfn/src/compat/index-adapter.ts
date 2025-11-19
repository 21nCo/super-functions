import {
  SearchFn,
  type SearchFnOptions,
  type SearchFnSnapshot
} from "../search-engine";
import type {
  FlexIndexOptions,
  FlexSearchAddInput,
  FlexSearchQueryOptions,
  FlexSearchWorkerSnapshot
} from "./types";

export class FlexSearchIndexAdapter {
  private readonly engine: SearchFn;

  constructor(options: FlexIndexOptions & SearchFnOptions) {
    this.engine = new SearchFn({
      ...options,
      cache: {
        terms: options.cache?.term,
        vectors: options.cache?.vector
      }
    });
  }

  async addAsync(id: string | number, text: string): Promise<void> {
    await this.engine.add({
      id,
      fields: {
        text
      }
    });
  }

  async addDocument(input: FlexSearchAddInput): Promise<void> {
    await this.engine.add(input);
  }

  async searchAsync(query: string, options?: FlexSearchQueryOptions): Promise<(string | number)[]> {
    const searchOptions = this.translateOptions(options);
    return this.engine.search(query, searchOptions);
  }

  async searchCacheAsync(query: string, options?: FlexSearchQueryOptions): Promise<(string | number)[]> {
    return this.searchAsync(query, options);
  }

  private translateOptions(options?: FlexSearchQueryOptions) {
    if (!options) return undefined;
    
    const { field, ...rest } = options;
    return {
      ...rest,
      fields: field ? (Array.isArray(field) ? field : [field]) : undefined
    };
  }

  async removeAsync(id: string | number): Promise<void> {
    await this.engine.remove(id);
  }

  async clear(): Promise<void> {
    await this.engine.clear();
  }

  async exportSnapshot(): Promise<SearchFnSnapshot> {
    return this.engine.exportSnapshot();
  }

  async importSnapshot(snapshot: SearchFnSnapshot): Promise<void> {
    await this.engine.importSnapshot(snapshot);
  }

  async exportWorkerSnapshot(): Promise<FlexSearchWorkerSnapshot> {
    return this.engine.exportWorkerSnapshot();
  }

  async importWorkerSnapshot(payload: FlexSearchWorkerSnapshot): Promise<void> {
    await this.engine.importWorkerSnapshot(payload);
  }
}
