---
title: Credentials and HTTP client
description: Persist named profiles and make authenticated requests with bounded retries.
---

`createCredentialStore(path?)` stores named `{ backend, key }` profiles in an INI file. Pass a product-specific path; the legacy default is Conduct-specific. The synchronous store supports `getProfile`, `setProfile`, `hasProfile`, `removeProfile`, and `listProfiles`. A missing profile raises `MissingProfileError`.

Credential writes use a sibling lock, a mode-0600 temporary file, fsync, and atomic rename. Concurrent writers fail with `CLIFN_CREDENTIAL_STORE_BUSY`; symlink credential files are rejected. Filesystem permissions are a fallback, not encryption or an OS keychain. For keychain integration, inject a `CredentialStore` implementation and persist values before reporting success.

## Make a request

```ts
import { createApiClient } from "@clifn/core/client";
import { createCredentialStore } from "@clifn/core/credentials";
import { homedir } from "node:os";
import { join } from "node:path";

const client = createApiClient({
  credentials: createCredentialStore(join(homedir(), ".my-cli", "credentials")),
  profile: "default",
  projectId: "example",
});

const response = await client.get<{ items: unknown[] }>("/items", { limit: 20 });
console.log(response.data);
```

Alternatively pass `{ baseUrl, apiKey }` directly. The client adds Bearer authorization unless the request sets its own authorization header, and adds `X-Project-ID` when configured. Paths must be relative. Responses include status, parsed data, and headers. Non-2xx responses throw `HttpFailureError`; transport failures throw `HttpRequestError`.

Only GET requests retry by default, on HTTP 429 or 5xx and retryable transport failures. Use `request({ ..., retrySafe: true })` only when the server guarantees idempotency. One-shot stream bodies are not retried. A timed-out write may already have succeeded, so reconcile before repeating it. `ApiClientConfig` accepts `retries`, `retryDelayMs`, `timeoutMs`, `defaultHeaders`, and `fetchImpl`.
