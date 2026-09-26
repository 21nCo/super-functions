---
title: Browser client
description: Use only the narrow browser-safe route helper.
---

# Browser client

`@plugfn/client` calls PlugFn's server routes for provider discovery, connection initiation and inspection, disconnect, sync jobs, and checkpoints. It does not contain provider credentials, OAuth token exchange, webhook signature verification, or direct provider API clients.

The server must authenticate every request and enforce ownership. A browser helper does not grant provider access by itself. The exact allowed operations are in the [client boundary](/docs/reference/client-boundary); direct provider actions and workflow execution stay server-side.
