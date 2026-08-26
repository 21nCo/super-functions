import {
  createCapabilityAdminClient,
  type AdminClient,
  type AdminClientRequestOptions,
} from "@superfunctions/admin";
import { searchFnAdminCapability } from "./index.js";
import type {
  SearchFnBatchIndexInput,
  SearchFnGetInput,
  SearchFnIndexDocumentInput,
  SearchFnItemOutput,
  SearchFnListInput,
  SearchFnListOutput,
  SearchFnMutationOutput,
} from "./types.js";

/** SearchFn-scoped TypeScript client with one named method per manifest operation. */
export function createSearchFnAdminClient(adminClient: AdminClient) {
  const client = createCapabilityAdminClient(searchFnAdminCapability, adminClient);
  return Object.assign(client, {
    adapters: {
      list: (input: SearchFnListInput = {}, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnListOutput>("searchfn.adapters-backends.list", input, options),
      get: (input: SearchFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnItemOutput>("searchfn.adapters-backends.get", input, options),
    },
    indexes: {
      list: (input: SearchFnListInput = {}, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnListOutput>("searchfn.indexes-collections.list", input, options),
      get: (input: SearchFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnItemOutput>("searchfn.indexes-collections.get", input, options),
      clear: (input: SearchFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnMutationOutput>("searchfn.indexes-collections.clear-index", input, options),
    },
    health: {
      list: (input: SearchFnListInput = {}, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnListOutput>("searchfn.health.list", input, options),
      get: (input: SearchFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnItemOutput>("searchfn.health.get", input, options),
    },
    documents: {
      index: (input: SearchFnIndexDocumentInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnMutationOutput>("searchfn.documents.index", input, options),
      batchIndex: (input: SearchFnBatchIndexInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnMutationOutput>("searchfn.documents.batch-index", input, options),
      remove: (input: SearchFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<SearchFnMutationOutput>("searchfn.documents.remove-document", input, options),
    },
  });
}
