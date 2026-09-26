---
title: Mocking an API
description: Serve an OpenAPI contract before a backend is ready.
---

# Mocking an API

Run the CLI against an OpenAPI document:

```sh
npx apifn mock .apifn/openapi.yml
```

`@apifn/mock` also exposes `createMockServer` for embedding a mock server in test setup. It can generate responses from schemas or examples, optionally validate incoming requests, apply latency, and configure CORS and request-body limits. Defaults and exact options are in the [mock package reference](/docs/reference/mock).

Mocked responses show contract behavior. They do not prove that a deployed server implements the same contract. Run collection tests against the real server before release.
