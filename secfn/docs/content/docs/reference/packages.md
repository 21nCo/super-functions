---
title: Packages
description: Current SecFn package map and import surfaces.
---

# Packages

| Package | Role |
| --- | --- |
| `@secfn/core` | Pure encryption, AAD, scanner, schema, shared types, and errors. Also exports `./id`. |
| `@secfn/server` | Adapter-backed vault, router, access, rate limiting, audit, and scanner. Also exports `./audit`. |
| `@secfn/runtime` | Read-only secret and set client for trusted processes. |

The server uses `@superfunctions/db` for persistence and `@superfunctions/http` for routing. It does not publish a framework-specific adapter. The repository's older V0 specification describes other planned components; inspect current package manifests and exports before importing one.
