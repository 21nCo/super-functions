import type { AddDocumentInput } from "../search-engine";
import type { SearchFn } from "../search-engine";

export interface FlexSearchDocumentStore {
  [docId: string]: Record<string, unknown> | undefined;
}

export interface FlexSearchMigrationOptions {
  indexFields: string[];
  storeFields?: string[];
  transformFieldValue?: (value: unknown, field: string, docId: string) => string;
  filterDocument?: (record: Record<string, unknown>, docId: string) => boolean;
}

export interface FlexSearchMigrationResult {
  documents: AddDocumentInput[];
  skipped: string[];
}

const DEFAULT_TRANSFORMER = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined && item !== null)
      .map((item) => DEFAULT_TRANSFORMER(item))
      .filter((text) => text.length > 0)
      .join(" ");
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value, (_key: string, v: unknown) => {
      if (typeof v === "bigint") return String(v);
      return v;
    });
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
};

export function createDocumentsFromFlexStore(
  store: FlexSearchDocumentStore,
  options: FlexSearchMigrationOptions
): FlexSearchMigrationResult {
  if (!options.indexFields.length) {
    throw new Error("indexFields must contain at least one field to migrate");
  }

  const transform = options.transformFieldValue ?? ((value) => DEFAULT_TRANSFORMER(value));
  const shouldInclude = options.filterDocument ?? (() => true);
  const storeFields = options.storeFields ?? options.indexFields;

  const documents: AddDocumentInput[] = [];
  const skipped: string[] = [];

  for (const [docId, record] of Object.entries(store)) {
    if (!record) {
      skipped.push(docId);
      continue;
    }

    if (!shouldInclude(record, docId)) {
      skipped.push(docId);
      continue;
    }

    const fields: Record<string, string> = {};
    let hasContent = false;

    for (const field of options.indexFields) {
      const originalValue = record[field];
      if (originalValue === undefined || originalValue === null) continue;
      const text = transform(originalValue, field, docId).trim();
      if (!text) continue;
      fields[field] = text;
      hasContent = true;
    }

    if (!hasContent) {
      skipped.push(docId);
      continue;
    }

    const storePayload: Record<string, unknown> = {};
    for (const field of storeFields) {
      if (field in record) {
        storePayload[field] = record[field];
      }
    }

    documents.push({
      id: docId,
      fields,
      store: Object.keys(storePayload).length > 0 ? storePayload : undefined
    });
  }

  return { documents, skipped };
}

export async function migrateFlexStoreToSearchFn(
  engine: SearchFn,
  store: FlexSearchDocumentStore,
  options: FlexSearchMigrationOptions & { concurrency?: number }
): Promise<FlexSearchMigrationResult> {
  const { documents, skipped } = createDocumentsFromFlexStore(store, options);
  const concurrency = Math.max(1, options.concurrency ?? 8);

  let index = 0;
  const executeNext = async (): Promise<void> => {
    const current = index;
    index += 1;
    if (current >= documents.length) return;
    const doc = documents[current];
    await engine.add(doc);
    await executeNext();
  };

  const workers = Array.from({ length: Math.min(concurrency, documents.length) }, () => executeNext());
  await Promise.all(workers);

  return { documents, skipped };
}
