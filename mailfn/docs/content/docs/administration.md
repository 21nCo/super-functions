---
title: Administration capability
description: Understand MailFn's Super Console resource and action contract.
---

`@mailfn/admin` declares a required-product Super Console capability for MailFn resources and actions. It describes projects, inboxes, messages, domains, webhooks, operational controls, and related permissions through a typed admin manifest. Sensitive fields are marked for redaction, and higher-risk actions require explicit confirmation in the capability definition.

The capability package is a contract, not a deployed control plane. The host must bind real MailFn services, authorization, audit, and credential handling. Do not expose reveal or destructive actions solely because the manifest declares them. See the [admin source](https://github.com/21nCo/super-functions/blob/dev/mailfn/admin/src/index.ts) for exact resource IDs and action schemas.
