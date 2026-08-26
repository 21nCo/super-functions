import type {
  AdminOperationContext,
  AdminOperationResult,
} from "@superfunctions/admin";

export type SearchFnAdminRecord = Record<string, unknown>;

export interface SearchFnListInput {
  cursor?: string;
  limit?: number;
  search?: string;
  filter?: SearchFnAdminRecord;
  sort?: readonly SearchFnAdminRecord[];
}

export interface SearchFnGetInput { id: string }
export interface SearchFnIndexDocumentInput {
  id: string;
  payload: { fields: Record<string, string> };
}
export interface SearchFnBatchIndexInput {
  payload: {
    resource: string;
    documents: Array<{ id: string | number; fields: Record<string, string> }>;
  };
}

export interface SearchFnListOutput {
  items: SearchFnAdminRecord[];
  nextCursor: string | null;
}
export interface SearchFnItemOutput { item: SearchFnAdminRecord }
export interface SearchFnMutationOutput extends SearchFnAdminRecord { accepted: true }

type Result<T> = Promise<AdminOperationResult<T>> | AdminOperationResult<T>;

/** Explicit domain contract for every operation in the SearchFn admin manifest. */
export interface SearchFnAdminService {
  listAdapters(input: SearchFnListInput, context: AdminOperationContext): Result<SearchFnListOutput>;
  getAdapter(input: SearchFnGetInput, context: AdminOperationContext): Result<SearchFnItemOutput>;
  listIndexes(input: SearchFnListInput, context: AdminOperationContext): Result<SearchFnListOutput>;
  getIndex(input: SearchFnGetInput, context: AdminOperationContext): Result<SearchFnItemOutput>;
  listHealth(input: SearchFnListInput, context: AdminOperationContext): Result<SearchFnListOutput>;
  getHealth(input: SearchFnGetInput, context: AdminOperationContext): Result<SearchFnItemOutput>;
  indexDocument(input: SearchFnIndexDocumentInput, context: AdminOperationContext): Result<SearchFnMutationOutput>;
  batchIndex(input: SearchFnBatchIndexInput, context: AdminOperationContext): Result<SearchFnMutationOutput>;
  removeDocument(input: SearchFnGetInput, context: AdminOperationContext): Result<SearchFnMutationOutput>;
  clearIndex(input: SearchFnGetInput, context: AdminOperationContext): Result<SearchFnMutationOutput>;
}
