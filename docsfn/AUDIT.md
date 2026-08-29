# Docsfn Implementation Audit

**Spec Version:** v1 (2026-01-18)
**Implementation Status:** v0 (Foundation)

## Coverage Report

| Feature Area | Spec Requirement | Implementation Status | Notes |
| :--- | :--- | :--- | :--- |
| **Architecture** | Core + Providers + Adapters | ✅ **Implemented** | `core`, `provider-fs`, `react` packages created. |
| **Content Sourcing** | `DocsContentProvider` Interface | ✅ **Implemented** | Bulk-load strategy used. |
| **Filesystem Provider** | Docs, Blog, API from FS | ✅ **Implemented** | Supports `gray-matter` frontmatter. |
| **Manifest Generation** | Normalize content, build routes | ✅ **Implemented** | Stable IDs and routing generated. |
| **Navigation** | Auto-Sidebar, TOC Extraction | ✅ **Implemented** | Directory-based sidebar, Regex-based TOC. |
| **Search** | `searchfn` Integration | ✅ **Backend Complete** | Index generation & snapshotting works. **UI Missing**. |
| **API Docs** | OpenAPI Ingestion | ✅ **Backend Complete** | Specs loaded into manifest. **UI Missing**. |
| **React Adapter** | Layout, Sidebar, TOC | ⚠️ **Partial** | Basic chrome components exist. Search/API UI missing. |
| **Svelte Adapter** | Svelte Components | ❌ **Not Started** | |
| **Blog** | Post Model & Listing | ✅ **Data Complete** | Manifest includes blog posts. |

## Critical Gaps for v1 Release

1.  **Search UI**: Need a React component (Dialog/Combobox) to consume the `searchfn` snapshot and execute queries.
2.  **CLI**: A `docsfn dev` or `docsfn build` CLI would significantly improve DX vs writing scripts.
3.  **Live Reload**: The current provider reads files once. A watcher is needed for dev mode.
4.  **Markdown Rendering**: `docsfn` provides raw markdown string. The consuming app (Next.js) needs to process it (MDX/Remark). The spec intentionally leaves this to the adapter/app, so this is "by design" but worth noting as "integration work required".

## Conclusion

The `docsfn` core is robust and successfully decouples content from presentation. It is ready for "Early Access" use by developers building custom docs sites who are comfortable handling the final Markdown-to-HTML rendering step.
