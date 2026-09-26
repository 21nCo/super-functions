---
title: Review and sidecar
description: Keep editorial data bound to canonical source.
---

Comments, replies, suggestions, review transitions, history references, audit data, and asset references live in a validated sidecar bound to the Markdown source. Immutable revision history is stored separately by `@mdfn/server`. Source edits map anchors through the transaction pipeline.

Persist the source and complete sidecar together. A client must use the document version and the server's authorization policy when changing review state. The [core](/docs/reference/core), [server](/docs/reference/server), and [components](/docs/reference/components) packages define the underlying model.
