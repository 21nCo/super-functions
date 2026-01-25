import type { DatafnPlugin } from "@datafn/core";

export interface SearchFnPlugin extends DatafnPlugin {
  name: "searchfn";
  selectCandidates(params: {
    resource: string;
    query: string;
    type: "fullText" | "semantic";
    fields?: string[];
    topK?: number;
  }): Promise<string[]>; // Returns candidate ids

  updateIndices(params: {
    resource: string;
    records: Record<string, unknown>[];
    operation: "upsert" | "delete";
  }): Promise<void>;
}

export function isSearchPlugin(plugin: DatafnPlugin): plugin is SearchFnPlugin {
  return (
    plugin.name === "searchfn" &&
    typeof (plugin as any).selectCandidates === "function" &&
    typeof (plugin as any).updateIndices === "function"
  );
}
