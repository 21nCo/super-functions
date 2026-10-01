---
title: Extensions and profiles
description: Resolve syntax ownership, conflicts, and migrations.
---

`@mdfn/extensions` declares built-in syntax and extension helpers. Extensions may declare syntax ownership, dependencies, conflicts, preservation behavior, security rules, diagnostics, and migrations; these capabilities are optional, and built-in extensions do not all declare every field. `@mdfn/registry` holds host-controlled extension packages and reusable editor profiles.

Use the same resolved extension set across parse, serialize, render, editor, and collaboration boundaries. Changing a profile can change schema and normalization behavior, so treat it as a document migration. See [extensions](/docs/reference/extensions) and [registry](/docs/reference/registry).
