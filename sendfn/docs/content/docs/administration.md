---
title: Administration
description: Integrate SendFn into a host control plane.
---

`sendfn/admin` declares a Super Console capability and adapter for SendFn resources. The domain adapter binds a project-owned public SendFn client to administrative actions. This package is a contract and integration layer; the host is responsible for authorization, audit, secure credential handling, and deployment.

See the [admin package source](https://github.com/21nCo/super-functions/tree/dev/sendfn/admin) for current resource and action schemas. Do not expose destructive or secret-bearing actions solely because they appear in a capability manifest.
