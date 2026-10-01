---
title: Operations and limits
description: Source availability, release checks, and external proof boundaries.
---

The root README describes a dual-language SDK and an admin package, but the current `origin/dev` tree contains only `langfn/typescript`. The TypeScript adoption is unpublished and its Python Google adapter has not received these changes. Verify the built or packed source and separately inspect any registry artifact before relying on a feature. There is no shared `getSchema` CLI discovery contract for adapter tables.

Run `npm run gate:langfn-release` from the repository root for TypeScript build, type checking, the full TypeScript test suite, and built import checks. The gate does not run a duplication check. Live Gemini qualification remains separate. Green static docs checks do not establish a provider's live behavior, database migration, hosted HTTP security, or release readiness.

Keep model credentials and tool/network privileges in a trusted host. Use scoped stores for HTTP traces and feedback, atomic checkpoint consumption for graph resume, and an egress proxy when dynamic tool hostnames are required. The [release gate reference](/docs/reference/release-gate) records precise constraints.
