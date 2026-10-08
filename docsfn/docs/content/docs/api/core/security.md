---
title: core — Security
description: HTML trust, auth, and redaction helpers in @docsfn/core.
---

# Security (`@docsfn/core`)

## HTML sanitization (`sanitize.ts`)

| Export | Role |
| --- | --- |
| **`BLOCKED_HTML_TAGS`** | Tags rejected in Markdown sources (`script`, `iframe`, `object`, `embed`, `link`, `meta`). |
| **`BLOCKED_HTML_PATTERNS`** | Event-handler attributes and unsafe URL schemes. |
| **`findUnsafeHtml(source)`** | Returns match metadata. |
| **`assertSafeSource(input)`** | Throws **`DOCS_HTML_UNSAFE`** when matches exist (unless raw HTML allowed). |

## Trust assertions

| Function | Role |
| --- | --- |
| **`assertSourceEntriesTrusted`** | Validates Markdown entries before manifest compile. |
| **`assertCompiledContentTrusted`** | Validates transformed Markdown prior to UI compile. |
| **`collectUnsafeHtmlDiagnostics`** | Non-throwing diagnostic collector. |

**`resolveUnsafeHtmlAllowlist`** merges env **`DOCSFN_HTML_UNSAFE_ALLOWLIST`** (comma-separated globs).

## Type shapes

**`SourceTrustPolicy`:**

| Field | Type | Description |
| --- | --- | --- |
| `allowUnsafeHtml?` | `boolean` | Permit raw HTML in sources. |
| `allowUnsafeHtmlAllowlist?` | `string[]` | Glob patterns for paths that may contain raw HTML. |

**`AssertSourceEntriesTrustedInput`:**

| Field | Type | Description |
| --- | --- | --- |
| `entries` | `DocsSourceEntry[]` | Source entries to validate. |
| `policy?` | `SourceTrustPolicy` | Trust configuration. |

**`AssertCompiledContentTrustedInput`:**

| Field | Type | Description |
| --- | --- | --- |
| `source` | `string` | Transformed Markdown source. |
| `sourcePath?` | `string` | Path for diagnostics. |
| `policy?` | `SourceTrustPolicy` | Trust configuration. |

**`AssertDocsRouteAccessInput`:**

| Field | Type | Description |
| --- | --- | --- |
| `config` | `Pick<DocsConfig, "auth">` | Auth portion of docs config. |
| `route` | `string` | Route path to check. |
| `session?` | `unknown \| null` | Current session object. |
| `resolveSession?` | `() => unknown \| Promise<unknown>` | Lazy session resolver. |
| `isRoutePrivate?` | `(route: string) => boolean` | Custom private-route predicate. |
| `authorize?` | `(input: { route, session }) => boolean \| Promise<boolean>` | Custom authorization check. |

**`DocsRouteAccessResult`:**

| Field | Type | Description |
| --- | --- | --- |
| `mode` | `DocsAuthMode` | Resolved auth mode (`public`, `private`, `mixed`). |
| `route` | `string` | The checked route. |
| `requiresAuth` | `boolean` | Whether the route needs authentication. |
| `allowed` | `boolean` | Whether access is granted. |

**`ResolveUnsafeHtmlAllowlistInput`:**

| Field | Type | Description |
| --- | --- | --- |
| `value?` | `string` | Explicit allowlist string (overrides env). |

## Auth

| Export | Role |
| --- | --- |
| **`CANONICAL_DOCS_AUTH_MODES`** | `["public","private","mixed"]`. |
| **`resolveDocsAuthMode`** | Maps config → mode (disabled auth → `public`). |
| **`assertDocsRouteAccess`** | Async gate: throws **`DOCS_AUTH_REQUIRED`** / **`DOCS_AUTH_FORBIDDEN`**. |

## Redaction

**`redactSensitiveText`**, **`redactSensitivePayload`** — strip common secret patterns from strings and nested objects (used by search + analytics).


For mixed-mode sites with a custom `isRoutePrivate` predicate, pass that same
predicate and `auth` configuration to `buildSearchIndex`, `buildLlmsTxt`,
`buildLlmsFullTxt`, and `buildLlmsTxtArtifacts`. Public artifacts are built outside
the HTTP request gate and must use the same route classification to omit protected
content. Private frontmatter and `/private` routes remain excluded as well.
If the classifier is omitted with enabled mixed-mode auth, these programmatic
artifact APIs also treat every route as private; they do not infer public routes.

An API overview can contain every child operation's content. If any canonical
operation, schema, or tag route is protected, public search and LLM artifacts omit
that API entirely. With a custom mixed-mode classifier, normalize raw OpenAPI input
into a canonical reference before artifact generation; unclassified raw API specs
are omitted conservatively. Search artifacts also omit draft posts from preview
manifests.

The standard CLI cannot load a host route classifier. For enabled mixed-mode auth, `docsfn build` and `docsfn llms` warn and omit all routes from public search/LLM artifacts. Generate selected public content through the programmatic API with the same `isRoutePrivate` predicate as the runtime. Canonical API child arrays must all exist and each child must carry an absolute route; malformed or incomplete API route inventories are omitted.
