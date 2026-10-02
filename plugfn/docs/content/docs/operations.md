---
title: Operations
description: Run the release gate and consult incident runbooks.
---

Run the authoritative repo-root gate on the exact commit you plan to use:

```sh
npm run gate:plugfn-release
```

The gate covers the runtime, browser helper, providers, CLI, Python baseline, provider-specific checks, and docs inventory. A green result is still subject to each provider's matrix row. Production claims apply only to surfaces marked `production` on that same commit.

The [release guide](/docs/reference/release-gates) gives the gate steps. Source runbooks cover [OAuth](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/oauth-incident.md), [provider throttling](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/provider-throttle-incident.md), and [webhook security](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/runbooks/webhook-security-incident.md).
