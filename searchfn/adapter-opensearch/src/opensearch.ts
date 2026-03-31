import { ElasticsearchAdapter, type ElasticsearchAdapterOptions } from "@searchfn/adapter-elasticsearch";

/**
 * Options for the OpenSearch adapter. Inherits all `ElasticsearchAdapterOptions`
 * except `engine` (fixed to "opensearch"), including `defaults?: SearchDefaults`
 * for construct-time search defaults (prefix, fuzzy, fieldBoosts).
 */
export type OpenSearchAdapterOptions = Omit<ElasticsearchAdapterOptions, "engine">;

export class OpenSearchAdapter extends ElasticsearchAdapter {
  readonly name = "opensearch";

  constructor(options: OpenSearchAdapterOptions) {
    super({ ...options, engine: "opensearch" });
  }
}
