# DFQL (Data Function Query Language) - a query language for datafn


# Table schema
sample: `table-schema-sample.json`

## resources / tables
- name: string, name of the table
- version: number, version of the table
- idPrefix: string (optional), namespace prefix used for record ids (recommended default: `${tableName}:`)
- isRemoteOnly: boolean, if true - the table is only available on server and will not be cloned to client for offlinability
  - Queries and mutations will directly happen on server
- fields: array of field objects
- indices: object, key-value pairs of index types and fields to index for each index type
- permissions: object (optional), server-side authz hints for query/mutation (exact model is implementation-defined)

_fields_
- name: string, field name
- type: string, number, boolean, object, array, date, file
- required: boolean
- nullable: boolean (optional)
- encrypt: boolean
- default: any (optional), default value when creating records
- enum: array (optional), allowed values
- min, max: number (optional), numeric constraints
- minLength, maxLength: number (optional), string constraints
- pattern: string (optional), regex pattern for strings
- readonly: boolean (optional), if true - can only be set by system/server
- unique: boolean or string (optional), uniqueness constraint (string can be a constraint name)

_indices_
- base: array of index names for base queries like filtering
- search: array of index names for full-text search
- vector: array of index names for vector search

Notes:
- base can be collapsed and inferred when search and vector indices are absent. ex: "indices": ["label"] is equivalent to "indices": { "base": ["label"], "search": [], "vector": [] }
- system fields are assumed to exist on all records (implementation-defined). Common examples: `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `isArchived`, `trashInformation`.



## relations / links
- from, to: string, names of the tables
  - Can be a table name or an array of table names
- type: relation type (one-many, many-one, many-many, htree)
- relation: name to reference when querying from `from` table to `to` table
  - if not set explicitly - it will be inferred as the `to` table name
- inverse: name to reference when querying from `to` table to `from` table
  - if not set explicitly - it will be inferred as the `from` table name
- cache: boolean, if true - the relation query result will be cached
- metadata: array of metadata fields

Notes:
- Avoid relying on naming inference for developer-facing APIs (task vs tasks, property vs properties, etc). Prefer explicitly setting `relation` and `inverse`.

### relation type

#### many-one
> many x have 1 y
- x: task, y: goal -> many tasks have one parent goal
- SQL database implementation: y as foreign key in x (e.g. goalId as foreign key in task table)
- Graph database implementation: simple edge

#### one-many
> 1 x have many y
- x: goal, y: task -> one goal having many tasks
- SQL database implementation: x as foreign key in y (e.g. goalId as foreign key in task table)
- Graph database implementation: simple edge

#### many-many
> many x have many y
  - x: collection, y: node -> a node can be part of many collections and a collection can have many nodes
  - SQL database implementation: join table with foreign keys to both x and y (e.g. collection_node join table with collectionId and nodeId as foreign keys)
- Graph database implementation: simple edge

#### htree
> hierarchy tree
- x: goal, y: goal -> a goal can have infinitely nested sub goals and therefore a goal can have a hierarchy of parent chain
- SQL database implementation: stored as materialized path in a single column (e.g. x-y-z)
- Graph database implementation: Link chain


------
# Query
Refer `query-sample.json` for full query example
- resource: string, name of the table
- version: number, version of the table to use for this query
- select: array of field names to select (refer select section for more details)
- filters: object, key-value pairs of field names and their filters (refer filters section for more details)
- search: object, full-text / semantic search (combined with filters using AND)
- sort: array of fields to sort by (refer sort section for more details)
- limit: number, maximum number of records to return
- offset: number, number of records to skip
- cursor: object, cursor-based pagination (preferred over offset for stability)
- count: boolean, if true - the query will return the total number of records matching the query
- omit: array of field names to omit from the result (Can be used when select is not specified which results in all fields being selected)
- groupBy: array of fields to group by (refer groupBy section for more details)
- aggregations: object, key-value pairs of aggregation aliases and their definitions (used with groupBy)
- having: object, filters applied on grouped rows (only valid when groupBy is present)

Notes:
- `search` will be delegated to searchFn plugin if present - the request will be forwarded to searchFn plugin for processing and further fetching of data, filtering from the result id set from searchfn will be handled by datafn.

## Response
The query response is implementation-defined, but DFQL recommends a stable envelope.

### Non-aggregate response (no groupBy)
- data: array of records
- count: number (optional, only when `count: true`)
- nextCursor: object (optional, only when using cursor pagination)

### Aggregate response (with groupBy)
- groups: array of grouped rows (group keys + aggregations)
- nextCursor: object (optional, only when using cursor pagination on grouped rows)

### Batch queries
If the request is an array of queries, the response should be an array of results in the same order.

## Select
List of fields to select from the query.
- Not specifying `select` selects all base fields on the record (no relation expansion).
- Relation expansion is always explicit via tokens like `parent.*`, `children.**`, `collections.#`, etc.


note: consider `y` as the relation name from `x`

### one-many relation
- y => id
- y.* => expands the y record

e.g. 
input (node): id, file.*, parent.*
output:
  id
  file: { ...file_record }
  parent: { ...parent_record }


### many-one relation
- y => list of all y ids
- y.* => expands the y records
- y.field.* => nested expand

e.g. 
input (goal): id, tasks.*, tasks.tags.*
output:
  id
  tasks: [ { ...task_record, tags: [{...tag_record },{...tag_record}] }, { ...task_record } ]


### many-many relation
- y => list of all y ids
- y.* => expands the y records and gives [ { ...y_record }]
- y.# => list of all relation entries [ {from: x_id, to: y_id, ...relation_metadata}, {from: x_id, to: y_id, ...relation_metadata}, ...]
- y.*# => expands the y records and gives along with relation metadata [ { ...y_record, $relation_metadata: { ...relation_metadata } }]

e.g. 
input (goal): id, tasks.*, collections.#*, collections.*.properties.*, links.#, links.#.linkTag.*
output:
  id
  tasks: [ { ...task_record }, { ...task_record } ]
  collections: [ 
    { ...collection_record, properties: [ { ...property_record }, { ...property record } ], $relation_metadata: { addedToCollectionAt: "", order: 0 } }, 
    { ...collection_record, properties: [ { ...property_record } ], $relation_metadata: { addedToCollectionAt: "", order: 1 } }
  ]
  links: [ { from: x_id, to: y_id, linkTag: { ...linkTag_record } }, { from: x_id, to: y_id, linkTag: { ...linkTag_record } } ]


### htree
- y => list of parent hiearachy ids (the a-b-c materialized path will be split into array)
- inverse => immediate children ids (get y where parent.endsWith("-x"))
- y.* => expands the parent hierarchy records
- inverse.* => expands the immediate children records 
- inverse.** => expands all children records (entire tree - get y.* where parent.includes("x"))

e.g.
input (goal): id, parent.*, children.**
output:
  id
  parent: [{ ...root_parent_record }, {...sub_parent_record }]
  children: [ { ...immediate_child_record}, { ...immediate_child_record_2 }, {...nested_child_record } ]


## Filters
key value pairs of field names and their filters
- field
  - string, name of the field to filter
  - can be a nested field like `parent.id`, `children.createdAt`, `collections.property.type`, etc. which resolves to the field in the related record
- value: string, number, boolean, array, date, or filter object

"field": value → equals
"field": [a, b, c] → in
"field": { "eq": "a" } → equals
"field": { "ne": "a" } → not equals
"field": { "gt": 10 } → greater than
"field": { "gte": 10 } → greater than or equal to
"field": { "lt": 10 } → less than
"field": { "lte": 10 } → less than or equal to
"field": { "like": "a%" } → like
"field": { "not_like": "a%" } → not like
"field": { "ilike": "a%" } → case insensitive like
"field": { "not_ilike": "a%" } → case insensitive not like
"field": { "before": "2021-01-01" } → before date
"field": { "after": "2021-01-01" } → after date
"field": { "between": ["2021-01-01", "2021-01-01"] } → between date
"field": { "not_between": ["2021-01-01", "2021-01-01"] } → not between date
"field": { "is_null": true } → is null
"field": { "is_not_null": true } → is not null
"field": { "is_empty": true } → is empty
"field": { "is_not_empty": true } → is not empty

### Relation filter semantics (important)
When a filter path crosses a relation that yields multiple rows (one-many, many-many, htree children), DFQL treats it as **ANY-match** by default.

Example: `{ "links.linkTag": ["a", "b"] }` means "there exists at least one link whose linkTag is in [a,b]".

To express ALL / NONE semantics, use an explicit relation filter block:

```json
{
  "links": {
    "$all": { "linkTag": ["a", "b"] }
  }
}
```

Supported relation quantifiers (when using relation blocks):
- `$any`: at least one related record matches
- `$all`: all related records match
- `$none`: no related records match

### Compound filters (nested AND / OR)

Use reserved keys in `filters`:
- `$and`: array of filter blocks, all must match
- `$or`: array of filter blocks, any may match

A **filter block** is either:
- A regular `filters` object (field → value | [a, b, c] | { op: value })
- Another `$and` / `$or` group

Notes:
- Multiple fields inside a single filter block are treated as an implicit `AND`.
- When you need `OR` + other conditions, wrap everything in a top-level `$and`.

Example: `isArchived=false AND (type IN ["markdown","html"]) AND (priority>10 OR createdAt after 2026-01-01)`

```json
{
  "$and": [
    { "isArchived": false },
    { "type": ["markdown", "html"] },
    {
      "$or": [
        { "priority": { "gt": 10 } },
        { "createdAt": { "after": "2026-01-01" } }
      ]
    }
  ]
}
```

Example: `(status="open" AND priority>=3) OR (status="paused" AND ownerId is null)`

```json
{
  "$or": [
    { "status": { "eq": "open" }, "priority": { "gte": 3 } },
    { "status": { "eq": "paused" }, "ownerId": { "is_null": true } }
  ]
}
```

## Search
Search can be combined with `filters` (AND).

Shape:
- query: string
- type: "fullText" | "semantic"
- fields: array of field names (optional; defaults to table `indices.search` fields for fullText)
- topK: number (optional; recommended for semantic)

Example:

```json
{
  "search": {
    "query": "offline sync",
    "type": "fullText",
    "fields": ["label", "text"]
  }
}
```

## Sort
Sort controls the ordering of the top-level records returned by the query.

### Shape
`sort` is an array of sort terms, applied left to right.

Supported forms:
- `"field"` → ascending
- `"field:asc"` / `"field:desc"`
- `{ "field": "fieldName", "direction": "asc" | "desc" }`

Notes:
- Use `sort` with `limit`/`offset` to make pagination stable.
- If `sort` is omitted, the backend may apply a default order (commonly `id:asc`).

Example:

```json
{
  "sort": ["updatedAt:desc", "id:asc"]
}
```

## Limit
Maximum number of records to return.

Notes:
- `limit` applies to the top-level records of the queried `resource`.
- Backends may enforce a maximum limit for safety.

Example:

```json
{
  "limit": 50
}
```

## Offset
Number of records to skip (pagination).

Notes:
- Prefer using `sort` whenever you use `offset`.
- Prefer using `cursor` pagination for stable infinite scrolling in frequently-mutated datasets.
- If `offset` is provided without `limit`, the backend may reject the query or treat it as "offset into an unbounded query" (discouraged).

Example:

```json
{
  "sort": ["createdAt:desc", "id:asc"],
  "limit": 20,
  "offset": 40
}
```

## Cursor (pagination)
Cursor pagination is recommended over `offset` for stability.

Shape:
- cursor.after: object mapping sort keys to their last seen values (must include the sort tie-breaker, typically `id`)
- cursor.before: object (optional, for backwards pagination)

Example:

```json
{
  "sort": ["updatedAt:desc", "id:desc"],
  "limit": 20,
  "cursor": {
    "after": { "updatedAt": "2026-01-17", "id": "node:abc" }
  }
}
```

## Count
If `count: true`, the query response includes the total number of records matching `filters` (ignoring `limit` and `offset`).

Notes:
- `count` is computed over the filtered result set before pagination.
- When `groupBy` is present, prefer using `aggregations` (e.g. `{ "count": { "op": "count" } }`) to get per-group counts.

## Omit
`omit` removes fields from the returned record(s).

Notes:
- Use `omit` when you want "select everything except a few fields".
- If both `select` and `omit` are provided, `omit` wins (omitted fields are removed from the final output).
- `omit` is applied to the output shape (it does not change which records match filters).

Example:

```json
{
  "omit": ["text", "notes"]
}
```

## GroupBy
Groups records by the provided field(s).

### Shape
`groupBy` is an array of field names.

When `groupBy` is present, the query becomes an aggregate query.

Recommended initial constraints:
- Relations/expansions in `select` are not supported with `groupBy`.
- The result rows are "groups": each row contains the group key fields plus computed aggregation fields.

### Aggregations (used with GroupBy)
`aggregations` is an object where each key is an alias you want in the result, and each value defines the aggregation.

Supported aggregation ops:
- `count`: count of records in the group
- `countDistinct`: count of distinct values for a field
- `sum`: sum of a numeric field
- `avg`: average of a numeric field
- `min`: minimum value of a field
- `max`: maximum value of a field

Aggregation definition shape:
- `{ "op": "count" }`
- `{ "op": "countDistinct", "field": "fieldName" }`
- `{ "op": "sum" | "avg" | "min" | "max", "field": "fieldName" }`

Notes:
- Aggregation `field` can be a nested field path (same rules as filters/select), but may require joins depending on the backend.
- With `groupBy`, `sort` can reference groupBy fields or aggregation aliases (e.g. `"count:desc"`).
- With `groupBy`, `limit`/`offset` apply to grouped rows (not raw records).

### Having
`having` filters the grouped rows after aggregations are computed.

Rules:
- keys can reference groupBy fields or aggregation aliases
- value uses the same operator syntax as `filters`

Example: only include groups with more than 10 records

```json
{
  "groupBy": ["status"],
  "aggregations": { "count": { "op": "count" } },
  "having": { "count": { "gt": 10 } }
}
```

Example: count goals per status (grouped rows)

```json
{
  "resource": "goal",
  "version": 1,
  "filters": { "isArchived": false },
  "groupBy": ["status"],
  "aggregations": {
    "count": { "op": "count" }
  },
  "sort": ["count:desc"]
}
```

Example: aggregate tasks per goalId (count + avg priority + last updatedAt)

```json
{
  "resource": "task",
  "version": 1,
  "filters": { "isArchived": false },
  "groupBy": ["goalId"],
  "aggregations": {
    "count": { "op": "count" },
    "avgPriority": { "op": "avg", "field": "priority" },
    "lastUpdatedAt": { "op": "max", "field": "updatedAt" }
  },
  "sort": ["count:desc", "goalId:asc"],
  "limit": 50
}
```

----
# Mutation
Refer `mutation-sample.json` for full mutation example
- resource: string, name of the table
- version: number, version of the table to use for this mutation
- mutationId: string (recommended), idempotency key for safe retries
- clientId: string (recommended), identifies the client/device emitting the mutation (useful for sync + dedupe)
- timestamp: number or string (optional), client timestamp for ordering/debugging
- context: string or object (optional), free-form metadata (source, feature, trace ids, etc)
- operation: string, operation to perform 
  - insert: insert a new record(s)
  - merge: merge record(s)
  - replace: replace existing record(s)
  - delete: delete existing record(s)
  - relate: create relation(s) from the record to other record(s)
  - modifyRelation: merge relation metadata for existing relation(s)
  - unrelate: remove relation(s) from the record
- id: string or array of strings
  - string, id of the record to perform the operation on
  - array of strings, ids of the records to perform the operation on
- record: object, record to insert/merge
- records: array of records to insert
- if: object (optional), conditional write guard (optimistic concurrency). Uses the same operator syntax as `filters`.
- cascade: array or object (optional), cascade behavior for delete
  - ["tasks","children"] → shorthand for delete cascading on those relations
  - { "tasks": "delete", "children": "unrelate" } → explicit per-relation cascade mode
- relations: object, relation payload for relate/modifyRelation/unrelate
  - keys: relation names (as defined / inferred in table schema)
  - value forms:
    - "record_id" → shorthand for { "$ref": "record_id" }
    - ["id-1", "id-2"] → shorthand for { "$ref": ["id-1", "id-2"] }
    - { "$ref": "record_id" | ["id-1", "id-2"], ...metadata } → relation payload with metadata (ex: join table fields in SQL)
      - op: string (optional), override relation operation for this payload
        - relate | unrelate | replace | mergeMeta
      - where: object (optional), target existing relation rows by metadata (useful for many-many join rows)
    - [ { "$ref": ..., ...metadata }, ... ] → multiple payload entries for the same relation (useful when metadata differs per related record)


Notes:
- relations shorthand: `relations.<relationName>: "record_id"` is equivalent to `relations.<relationName>: { "$ref": "record_id" }`

## Mutation response (recommended)
The mutation response should be explicit and machine-readable.

Recommended fields:
- ok: boolean
- mutationId: string (echo back)
- resource, operation, id: echo back request context
- affectedIds: array of record ids changed
- relationChanges: object (optional), per-relation changes applied
- errors: array (optional)

Recommended error shape (per item):
- code: string (ex: VALIDATION_FAILED, NOT_FOUND, CONFLICT, FORBIDDEN)
- message: string
- path: string (optional, ex: "record.label" or "relations.links[0].linkType")
- retryable: boolean (optional)

----
# Transact
`transact` bundles queries and mutations into a single ordered transaction on the server.

Recommended request shape:
- transactionId: string (optional)
- atomic: boolean (optional, default true)
- steps: array of steps, each step is either `{ "query": <Query> }` or `{ "mutation": <Mutation> }`

Example:

```json
{
  "transactionId": "tx-0001",
  "atomic": true,
  "steps": [
    { "query": { "resource": "goal", "version": 1, "filters": { "id": "goal:some-id" }, "select": ["id", "label"] } },
    { "mutation": { "resource": "goal", "version": 1, "operation": "merge", "id": "goal:some-id", "record": { "label": "Updated" } } }
  ]
}
```

Recommended response shape:
- ok: boolean
- results: array of step results in the same order as `steps`