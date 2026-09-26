---
title: Getting started
description: Choose the core, server, and runtime packages.
---

# Getting started

Install the package for the task. `@secfn/core` provides pure encryption, scanner, schema, and shared types. `@secfn/server` hosts the vault, control plane, and runtime API using `@superfunctions/db` and `@superfunctions/http`. `@secfn/runtime` is a read-only client for trusted server, CI, build, and local workflows.

```sh
npm install @secfn/core @secfn/server @secfn/runtime
```

Provision the database and apply the [schema migrations](/docs/migrations), supply a key provider or master key, mount the [server router](/docs/server), and implement host authentication and admin authorization. Create service tokens through authorized admin flows before configuring a [runtime client](/docs/runtime). The server does not provision a database or framework-specific mount for you.

For pure encryption, use `buildSecretAad`, `encryptSecret`, and `decryptSecret` from `@secfn/core` with a `KeyProvider`. For secret scanning, use `createSecurityScanner` and a reporter from the core package. See [package reference](/docs/reference/packages) for exports and responsibility boundaries.
