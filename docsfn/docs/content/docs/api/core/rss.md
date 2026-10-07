---
title: core — RSS
description: generateRSSFeed in @docsfn/core.
---

# RSS (`@docsfn/core`)

## `generateRSSFeed(manifest, options)`

**`RSSFeedOptions`:**

| Field | Type | Description |
| --- | --- | --- |
| `title` | `string` | Channel title. |
| `description` | `string` | Channel description. |
| `link` | `string` | Public site/blog base URL (no trailing slash required; normalized). |
| `language?` | `string` | Default **`en`**. |
| `collectionId?` | `string` | Named dated collection; defaults to the legacy blog. |
| `auth?` | `DocsConfig["auth"]` | Site access policy for public feed filtering. |
| `isRoutePrivate?` | `(route: string) => boolean` | Mixed-mode classifier; omitted classifiers fail closed. |
| `feedHref?` | `string` | Overrides the **`atom:link rel="self"`** URL (use when the served feed path differs from the selected collection feed path under the origin of **`link`**). |
| `itemHref?` | `(post) => string` | Overrides per-item **`link`** / **`guid`** when public post URLs differ from the origin of **`link`** joined with **`post.path`**. |

**Returns:** `string` — RSS 2.0 XML with Atom **`atom:link rel="self"`** (default: the origin of **`link`** joined with the selected collection feed path, unless **`feedHref`** is set).

Ordering prefers the selected collection's **`postOrder`** (or **`manifest.blog.postOrder`** for the legacy blog); otherwise sorts public posts by publish timestamp.

**Note:** The public function name is **`generateRSSFeed`** (not `buildRssFeed`).
