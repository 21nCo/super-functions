import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  type AdminCapabilityAdapter,
  type AdminOperationContext,
  type AdminOperationRequest,
} from "@superfunctions/admin";
import { searchFnAdminCapability } from "./index.js";
import type { SearchFnAdminService } from "./types.js";

function bind<TInput>(
  handler: (input: TInput, context: AdminOperationContext) => unknown,
) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}

/** Maps each declared SearchFn operation to one explicit domain method. */
export function createSearchFnAdminAdapter(
  service: SearchFnAdminService,
): AdminCapabilityAdapter<typeof searchFnAdminCapability> {
  return createKernelAdminCapabilityAdapter(searchFnAdminCapability, {
    "searchfn.adapters-backends.list": bind(service.listAdapters),
    "searchfn.adapters-backends.get": bind(service.getAdapter),
    "searchfn.indexes-collections.list": bind(service.listIndexes),
    "searchfn.indexes-collections.get": bind(service.getIndex),
    "searchfn.health.list": bind(service.listHealth),
    "searchfn.health.get": bind(service.getHealth),
    "searchfn.documents.index": bind(service.indexDocument),
    "searchfn.documents.batch-index": bind(service.batchIndex),
    "searchfn.documents.remove-document": bind(service.removeDocument),
    "searchfn.indexes-collections.clear-index": bind(service.clearIndex),
  });
}

export const createAdminAdapter = createSearchFnAdminAdapter;
