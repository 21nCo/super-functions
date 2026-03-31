/**
 * SQL query builders for the Postgres SearchFn adapter.
 *
 * All queries use parameterized statements to prevent SQL injection.
 * tsvector/tsquery is used for Postgres-native full-text search with ranking.
 */
import { resourceTableName } from "./postgres-schema";

export interface UpsertRow {
  docId: string;
  fieldName: string;
  fieldValue: string;
}

/**
 * Build a bulk upsert query for document fields.
 * Uses ON CONFLICT to handle upsert semantics per (doc_id, field_name).
 */
export function buildUpsertQuery(
  resource: string,
  rows: UpsertRow[],
  schema?: string,
): { text: string; values: unknown[] } {
  const table = resourceTableName(resource, schema);
  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const base = i * 3;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, to_tsvector('simple', $${base + 3}))`);
    values.push(rows[i].docId, rows[i].fieldName, rows[i].fieldValue);
  }

  const text = `
    INSERT INTO ${table} (doc_id, field_name, field_value, tsv)
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (doc_id, field_name) DO UPDATE
    SET field_value = EXCLUDED.field_value,
        tsv = EXCLUDED.tsv
  `;

  return { text, values };
}

/**
 * Build a DELETE query to remove rows for specific doc IDs in a resource.
 */
export function buildDeleteQuery(
  resource: string,
  ids: Array<string | number>,
  schema?: string,
): { text: string; values: unknown[] } {
  const table = resourceTableName(resource, schema);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  return {
    text: `DELETE FROM ${table} WHERE doc_id IN (${placeholders})`,
    values: ids.map(String),
  };
}

/**
 * Build a search query for a single resource using ts_rank.
 * Returns ranked doc_ids with scores.
 *
 * Deterministic tie-breaking: score DESC, doc_id ASC.
 */
export function buildSearchQuery(
  resource: string,
  query: string,
  opts: {
    fields?: string[];
    limit: number;
    fuzzy?: boolean | number;
    prefix?: boolean;
    schema?: string;
  },
): { text: string; values: unknown[] } {
  const table = resourceTableName(resource, opts.schema);
  const values: unknown[] = [];
  let paramIdx = 1;

  // Build tsquery - use plainto_tsquery for simple queries, or prefix matching (:*) for prefix/fuzzy
  let tsqueryExpr: string;
  if (opts.fuzzy || opts.prefix) {
    // For fuzzy or prefix: split words and use prefix matching (:*)
    values.push(query);
    tsqueryExpr = `(
      SELECT string_agg(lexeme || ':*', ' & ')
      FROM unnest(to_tsvector('simple', $${paramIdx})::text::tsvector) AS t(lexeme)
    )::tsquery`;
    paramIdx++;
  } else {
    values.push(query);
    tsqueryExpr = `plainto_tsquery('simple', $${paramIdx})`;
    paramIdx++;
  }

  // Optional field filter
  let fieldFilter = "";
  if (opts.fields && opts.fields.length > 0) {
    values.push(opts.fields);
    fieldFilter = `AND field_name = ANY($${paramIdx})`;
    paramIdx++;
  }

  // Limit
  values.push(opts.limit);
  const limitParam = `$${paramIdx}`;

  const text = `
    WITH query AS (
      SELECT ${tsqueryExpr} AS q
    ),
    matched AS (
      SELECT
        doc_id,
        SUM(ts_rank(tsv, query.q)) AS score
      FROM ${table}, query
      WHERE tsv @@ query.q ${fieldFilter}
      GROUP BY doc_id
    )
    SELECT doc_id, score
    FROM matched
    ORDER BY score DESC, doc_id ASC
    LIMIT ${limitParam}
  `;

  return { text, values };
}

/**
 * Build a searchAll query that spans multiple resource tables.
 * Each resource is queried independently, then results are merged and sorted.
 */
export function buildSearchAllQueries(
  resources: string[],
  query: string,
  opts: {
    fields?: string[];
    limitPerResource: number;
    fuzzy?: boolean | number;
    prefix?: boolean;
    schema?: string;
  },
): Array<{ resource: string; text: string; values: unknown[] }> {
  return resources.map((resource) => {
    const q = buildSearchQuery(resource, query, {
      fields: opts.fields,
      limit: opts.limitPerResource,
      fuzzy: opts.fuzzy,
      prefix: opts.prefix,
      schema: opts.schema,
    });
    return { resource, ...q };
  });
}

/**
 * Build a TRUNCATE query for clearing all documents in a resource table.
 */
export function buildClearQuery(
  resource: string,
  schema?: string,
): { text: string; values: unknown[] } {
  const table = resourceTableName(resource, schema);
  return {
    text: `DELETE FROM ${table}`,
    values: [],
  };
}
