---
title: Collections and tests
description: Run portable request suites with assertions and reports.
---

# Collections and tests

`@apifn/collections` reads and writes OpenCollection YAML, converts OpenAPI operations to collection requests, and runs them sequentially or in parallel. A collection directory contains `opencollection.yml`, request YAML files, and optional environments.

```sh
npx apifn init .apifn/collection --yes
npx apifn test .apifn/collection --env development --reporter json
```

Store environment-specific base URLs and credentials outside reusable request definitions. The runner supports assertions, bounded retries, timeouts, and console, JSON, JUnit, or silent reports. Pre-request and test scripts run in a restricted Node VM; treat that as a convenience boundary, not a process isolation guarantee. Read the [collections reference](/docs/reference/collections) and [CLI options](/docs/reference/cli) for the request model and runner settings.
