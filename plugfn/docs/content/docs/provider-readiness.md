---
title: Provider readiness
description: Use per-provider status and the release gate together.
---

The [readiness matrix](/docs/reference/readiness) mirrors the [release-gated source matrix](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/provider-readiness-matrix.md). GitHub, Linear, ClickUp, and Gmail are the core cross-language set; Notion is beta overall because Python parity is unsupported. Adjacent providers can be experimental, and inbound mail connectors are vertical-only. Unlisted providers are unsupported by default.

A provider is production-ready only when the matrix marks it `production` **and** `npm run gate:plugfn-release` passes from the repository root on the same commit. Presence in the source tree or a passing provider-specific test alone is insufficient. Check the exact TypeScript and Python columns before adoption.
