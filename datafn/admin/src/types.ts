import type {
  AdminOperationContext,
  AdminOperationResult,
} from "@superfunctions/admin";

export type DataFnAdminRecord = Record<string, unknown>;

export interface DataFnListInput {
  cursor?: string;
  limit?: number;
}

export interface DataFnGetInput {
  id: string;
}

export interface DataFnRecordFilter extends DataFnAdminRecord {
  resource: string;
}

export interface DataFnListRecordsInput extends DataFnListInput {
  filter: DataFnRecordFilter;
}

export interface DataFnQueryInput {
  payload: DataFnAdminRecord;
}

export interface DataFnMutateInput {
  /** Canonical resource:id audit target. Must match payload.resource and payload.id. */
  id: string;
  payload: DataFnAdminRecord;
}

export interface DataFnTransactInput {
  payload: DataFnAdminRecord;
}

export interface DataFnSchemaView {
  id: string;
  version: number;
  namespaced: boolean;
  resourceCount: number;
  relationCount: number;
}

export interface DataFnResourceView extends DataFnAdminRecord {
  id: string;
  name: string;
}

export interface DataFnRelationView extends DataFnAdminRecord {
  id: string;
  type: string;
  from: string | string[];
  to: string | string[];
}

export interface DataFnIndexView {
  id: string;
  resource: string;
  indices: unknown;
}

export interface DataFnCapabilityView {
  id: string;
  resource: string;
  capabilities: unknown;
  schemaCapabilities: unknown;
}

export interface DataFnPageOutput<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export interface DataFnItemOutput<TItem> {
  item: TItem;
}

export interface DataFnActionOutput<TItem = DataFnAdminRecord> {
  accepted: true;
  item: TItem;
}

export type DataFnAdminServiceResult<T> = Promise<AdminOperationResult<T>>;

/** Explicit operation surface consumed by the administration adapter. */
export interface DataFnAdminService {
  listSchemas(input: DataFnListInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnPageOutput<DataFnSchemaView>>;
  getSchema(input: DataFnGetInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnItemOutput<DataFnSchemaView>>;
  listResources(input: DataFnListInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnPageOutput<DataFnResourceView>>;
  getResource(input: DataFnGetInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnItemOutput<DataFnResourceView>>;
  listRelations(input: DataFnListInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnPageOutput<DataFnRelationView>>;
  getRelation(input: DataFnGetInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnItemOutput<DataFnRelationView>>;
  listIndices(input: DataFnListInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnPageOutput<DataFnIndexView>>;
  getIndex(input: DataFnGetInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnItemOutput<DataFnIndexView>>;
  listCapabilities(input: DataFnListInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnPageOutput<DataFnCapabilityView>>;
  getCapability(input: DataFnGetInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnItemOutput<DataFnCapabilityView>>;
  listRecords(input: DataFnListRecordsInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnPageOutput<DataFnAdminRecord>>;
  getRecord(input: DataFnGetInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnItemOutput<DataFnAdminRecord>>;
  query(input: DataFnQueryInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnActionOutput>;
  mutate(input: DataFnMutateInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnActionOutput>;
  transact(input: DataFnTransactInput, context: AdminOperationContext): DataFnAdminServiceResult<DataFnActionOutput>;
}
