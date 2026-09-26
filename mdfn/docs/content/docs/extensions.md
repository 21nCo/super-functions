---
title: Extensions and profiles
description: Resolve syntax ownership, conflicts, and migrations.
---

# Extensions and profiles

`@mdfn/extensions` declares built-in syntax and extension helpers. Every extension declares its syntax ownership, dependencies, conflicts, preservation behavior, security rules, diagnostics, and migrations. `@mdfn/registry` holds host-controlled extension packages and reusable editor profiles.

Use the same resolved extension set across parse, serialize, render, editor, and collaboration boundaries. Changing a profile can change schema and normalization behavior, so treat it as a document migration. See [extensions](/docs/reference/extensions) and [registry](/docs/reference/registry).
