import {
  getCapabilityFields,
  getRelationFkFieldsForResource,
  isDatafnE2eeEnvelope,
  KV_RESOURCE_NAME,
  resolveCapabilities,
  type DatafnE2eeCipherEnvelope,
  type DatafnSchema,
} from "@datafn/core";
import { createClientError } from "./errors.js";
import type {
  CloneResult,
  PullResult,
  PullResultCanonical,
} from "./sync/apply.js";

export type DatafnE2eeProvider = {
  keyRef: string;
  encrypt(input: {
    resource: string;
    id: string;
    field: string;
    plaintext: Uint8Array;
    aad: Uint8Array;
  }): Promise<DatafnE2eeCipherEnvelope>;
  decrypt(input: {
    resource: string;
    id: string;
    field: string;
    envelope: DatafnE2eeCipherEnvelope;
    aad: Uint8Array;
  }): Promise<Uint8Array>;
};

export type DatafnE2eeConfig = {
  enabled?: boolean;
  provider?: DatafnE2eeProvider;
  plaintextFields?:
    | readonly string[]
    | ((input: { schema: DatafnSchema; resource: string }) => readonly string[]);
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type RecordMutationOperation = "insert" | "merge" | "replace";

function isRecordMutationOperation(operation: unknown): operation is RecordMutationOperation {
  return operation === "insert" || operation === "merge" || operation === "replace";
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isE2eeEnabled(e2ee: DatafnE2eeConfig | undefined): boolean {
  return e2ee?.enabled === true;
}

export function isE2eePlaintextResource(resource: string | undefined): boolean {
  return resource === KV_RESOURCE_NAME;
}

export function assertE2eeProvider(
  e2ee: DatafnE2eeConfig | undefined,
  path: string,
): DatafnE2eeProvider {
  const provider = e2ee?.provider;
  if (!isE2eeEnabled(e2ee) || provider) {
    return provider as DatafnE2eeProvider;
  }
  throw createClientError(
    "DFQL_INVALID",
    "E2EE is locked. Unlock with the password before syncing encrypted data.",
    { path },
  );
}

function resolvePlaintextFields(
  schema: DatafnSchema,
  resourceName: string,
  e2ee: DatafnE2eeConfig | undefined,
): Set<string> {
  const fields = new Set<string>(["id"]);
  const resource = schema.resources.find((entry) => entry.name === resourceName);
  if (!resource) return fields;

  const resolvedCapabilities = resolveCapabilities(
    schema.capabilities as any,
    resource.capabilities as any,
  );
  for (const field of getCapabilityFields(resolvedCapabilities)) {
    fields.add(field.name);
  }

  for (const relationField of getRelationFkFieldsForResource(schema, resourceName)) {
    fields.add(relationField.field);
    if (relationField.resourceField) {
      fields.add(relationField.resourceField);
    }
  }

  for (const relation of schema.relations ?? []) {
    const toResources = Array.isArray(relation.to) ? relation.to : [relation.to];
    if (relation.type === "htree" && toResources.includes(resourceName)) {
      fields.add(relation.pathField || "parentPath");
    }
  }

  const additionalFields =
    typeof e2ee?.plaintextFields === "function"
      ? e2ee.plaintextFields({ schema, resource: resourceName })
      : e2ee?.plaintextFields;
  for (const field of additionalFields ?? []) {
    fields.add(field);
  }

  return fields;
}

function aadFor(resource: string, id: string, field: string): Uint8Array {
  return textEncoder.encode(`datafn-e2ee:v1:${resource}:${id}:${field}`);
}

function encodeFieldValue(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify({ value }));
}

function decodeFieldValue(bytes: Uint8Array): unknown {
  const parsed = JSON.parse(textDecoder.decode(bytes)) as { value?: unknown };
  return parsed.value;
}

async function encryptRecordFields(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  resource: string,
  id: string,
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isE2eeEnabled(e2ee) || isE2eePlaintextResource(resource)) {
    return record;
  }

  const provider = assertE2eeProvider(e2ee, "e2ee.provider");
  const plaintextFields = resolvePlaintextFields(schema, resource, e2ee);
  const encrypted: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(record)) {
    if (value === undefined || plaintextFields.has(field)) {
      encrypted[field] = value;
      continue;
    }
    if (isDatafnE2eeEnvelope(value)) {
      encrypted[field] = value;
      continue;
    }

    encrypted[field] = await provider.encrypt({
      resource,
      id,
      field,
      plaintext: encodeFieldValue(value),
      aad: aadFor(resource, id, field),
    });
  }

  return encrypted;
}

async function decryptRecordFields(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  resource: string,
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isE2eeEnabled(e2ee) || isE2eePlaintextResource(resource)) {
    return record;
  }

  const id = typeof record.id === "string" ? record.id : "";
  const decrypted: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(record)) {
    if (!isDatafnE2eeEnvelope(value)) {
      decrypted[field] = value;
      continue;
    }

    const provider = assertE2eeProvider(e2ee, `data.${resource}.${id}.${field}`);
    const plaintext = await provider.decrypt({
      resource,
      id,
      field,
      envelope: value,
      aad: aadFor(resource, id, field),
    });
    decrypted[field] = decodeFieldValue(plaintext);
  }

  return decrypted;
}

export async function encryptMutationForE2ee(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  mutation: unknown,
): Promise<unknown> {
  if (!isE2eeEnabled(e2ee)) return mutation;
  if (!isRecordObject(mutation)) return mutation;
  if (!isRecordMutationOperation(mutation.operation)) return mutation;
  if (typeof mutation.resource !== "string" || typeof mutation.id !== "string") return mutation;
  if (!isRecordObject(mutation.record)) return mutation;

  return {
    ...mutation,
    record: await encryptRecordFields(
      schema,
      e2ee,
      mutation.resource,
      mutation.id,
      mutation.record,
    ),
  };
}

export async function encryptMutationPayloadForE2ee(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  payload: unknown,
): Promise<unknown> {
  if (!isE2eeEnabled(e2ee)) return payload;
  if (Array.isArray(payload)) {
    return Promise.all(payload.map((entry) => encryptMutationForE2ee(schema, e2ee, entry)));
  }
  return encryptMutationForE2ee(schema, e2ee, payload);
}

export async function encryptPushPayloadForE2ee(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  payload: unknown,
): Promise<unknown> {
  if (!isE2eeEnabled(e2ee)) return payload;
  if (!isRecordObject(payload) || !Array.isArray(payload.mutations)) return payload;
  return {
    ...payload,
    mutations: await Promise.all(
      payload.mutations.map((entry) => encryptMutationForE2ee(schema, e2ee, entry)),
    ),
  };
}

export async function prepareTransactPayloadForE2ee(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  payload: unknown,
): Promise<unknown> {
  if (!isE2eeEnabled(e2ee) || !isRecordObject(payload) || !Array.isArray(payload.steps)) {
    return payload;
  }

  return {
    ...payload,
    steps: await Promise.all(payload.steps.map(async (step) => {
      if (!isRecordObject(step)) return step;
      if ("query" in step) {
        assertRemoteQueryAllowedForE2ee(e2ee, step.query);
      }
      if ("mutation" in step) {
        return {
          ...step,
          mutation: await encryptMutationForE2ee(schema, e2ee, step.mutation),
        };
      }
      // The server accepts both wrapped and bare transaction steps. Apply the
      // same E2EE boundary before either shape reaches the transport.
      if (typeof step.operation === "string") {
        return encryptMutationForE2ee(schema, e2ee, step);
      }
      if (typeof step.resource === "string") {
        assertRemoteQueryAllowedForE2ee(e2ee, step);
      }
      return step;
    })),
  };
}

export async function decryptCloneResultForE2ee(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  result: CloneResult,
): Promise<CloneResult> {
  if (!isE2eeEnabled(e2ee) || !result.ok) return result;
  const data: CloneResult["data"] = {};
  for (const [resource, records] of Object.entries(result.data ?? {})) {
    data[resource] = await Promise.all(
      records.map((record) => decryptRecordFields(schema, e2ee, resource, record)),
    );
  }
  return { ...result, data };
}

export async function decryptPullResultForE2ee(
  schema: DatafnSchema,
  e2ee: DatafnE2eeConfig | undefined,
  result: PullResult,
): Promise<PullResult> {
  if (!isE2eeEnabled(e2ee) || !result.ok) return result;
  if ("changes" in result && Array.isArray(result.changes)) {
    return {
      ...result,
      changes: await Promise.all(
        result.changes.map(async (change) => {
          if (!change.record) return change;
          return {
            ...change,
            record: await decryptRecordFields(schema, e2ee, change.resource, change.record),
          };
        }),
      ),
    };
  }

  const canonical = result as PullResultCanonical;
  const records: Record<string, Array<Record<string, unknown>>> = {};
  for (const [resource, resourceRecords] of Object.entries(canonical.records ?? {})) {
    records[resource] = await Promise.all(
      resourceRecords.map((record) => decryptRecordFields(schema, e2ee, resource, record)),
    );
  }

  const merged: Record<string, Array<Record<string, unknown>>> = {};
  for (const [resource, resourceRecords] of Object.entries(canonical.merged ?? {})) {
    merged[resource] = await Promise.all(
      resourceRecords.map((record) => decryptRecordFields(schema, e2ee, resource, record)),
    );
  }

  return {
    ...result,
    records,
    ...(canonical.merged ? { merged } : {}),
  };
}

export function assertRemoteQueryAllowedForE2ee(
  e2ee: DatafnE2eeConfig | undefined,
  query: unknown,
): void {
  if (!isE2eeEnabled(e2ee)) return;
  const entries = Array.isArray(query) ? query : [query];
  const hasDataResource = entries.some((entry) => {
    if (!isRecordObject(entry)) return true;
    const resource = typeof entry.resource === "string" ? entry.resource : undefined;
    return !isE2eePlaintextResource(resource);
  });
  if (!hasDataResource) return;
  throw createClientError(
    "DFQL_UNSUPPORTED",
    "Direct server query is unavailable when E2EE is enabled. Use the local clone.",
    { path: "query" },
  );
}

export function assertRemoteSearchAllowedForE2ee(
  e2ee: DatafnE2eeConfig | undefined,
): void {
  if (!isE2eeEnabled(e2ee)) return;
  throw createClientError(
    "DFQL_UNSUPPORTED",
    "Direct server search is unavailable when E2EE is enabled. Use local search.",
    { path: "search" },
  );
}
