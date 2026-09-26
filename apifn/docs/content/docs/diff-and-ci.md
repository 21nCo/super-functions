---
title: Diff and CI
description: Gate breaking contract changes and collection failures.
---

Compare the proposed OpenAPI document with an approved baseline:

```sh
npx @apifn/cli validate .apifn/openapi.yml --format json
npx @apifn/cli diff .apifn/base-openapi.yml .apifn/openapi.yml --format json
npx @apifn/cli test .apifn/collection --env development --reporter json
```

The reusable GitHub Actions workflow at `.github/workflows/apifn-api-check.yml` runs the published pinned CLI against the caller repository. It validates the spec, reports breaking changes, runs collections, and can post a PR summary. The caller needs `contents: read` and `pull-requests: write` permissions. Pin a commit or release tag for an immutable workflow. The workflow's `cli_version` input asserts its lockfile pin; it does not select an arbitrary package version. See the [source overview](/docs/reference/overview) for a complete caller example and non-GitHub CI setup.
