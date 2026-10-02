---
title: Persistence and events
description: Understand records, suppressions, and delivery lifecycle.
---

SendFn records email, SMS, WhatsApp, and push transactions plus communication events. Device tokens and the suppression list are separate records. The TypeScript database adapter expects the corresponding models in the host database.

The email path can block suppressed recipients, and SES lifecycle notifications can record bounces and complaints. Enable event and suppression behavior in the client options for the desired deployment policy. A database adapter must preserve the required constraints and transactional behavior; the console provider and memory adapters are development conveniences.

See the [TypeScript source guide](/docs/reference/typescript) for the expected model names and the [Python guide](/docs/reference/python) for SQLAlchemy schema helpers.
