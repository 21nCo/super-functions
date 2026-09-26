---
title: Verification
description: Run the consumer and browser gates for an MDFN integration.
---

# Verification

The repository checks the source and package contract with:

```sh
npm run verify:mdfn
npm run verify:mdfn-browser
npm run verify:mdfn-consumers
npm run verify:mdfn-examples
```

These gates include CommonMark examples, source preservation, fuzz and large-document cases, package builds and packs, runtime exports, SSR, and browser flows for the supported framework adapters. They verify the repository implementation, while a host application should also test its own database, authorization callback, transport, and deployment. See the [overview](/docs/reference/overview) and [testing package](/docs/reference/testing).
