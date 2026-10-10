---
title: Admin capability
description: The current Super Console declaration for CliFn.
---

`@clifn/admin` exports `cliFnAdminCapability`, `cliFnAdminAdapter`, and their `adminCapability` and `adminAdapter` aliases for Super Console registration. Its capability is declared **unavailable** and has no operations. CliFn currently provides local CLI process utilities; it has no durable server-side operator service or remote authorization boundary.

Do not expose credential files, local command execution, or scaffolding as remote admin actions. Consumers building command-line tools should use `@clifn/core` directly. See the [admin source](https://github.com/21nCo/super-functions/blob/dev/clifn/admin/src/index.ts) for the declared schema version, installation scope, and availability reason.
