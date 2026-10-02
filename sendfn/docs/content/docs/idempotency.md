---
title: Idempotent email sends
description: Use stable keys for retried outbound requests.
---

Email calls can include an `idempotencyKey` so a retried request maps to the same logical transaction. Keep the key stable for one logical message and change it for a new send. Provider behavior matters: the edge email adapter rejects an idempotency key when the selected provider does not declare idempotency support.

Do not blindly retry after an ambiguous provider response. Check the transaction status and provider guarantees before retrying. The TypeScript email service stores request fingerprints and ambiguity state to help distinguish these outcomes. See the [source email service](https://github.com/21nCo/super-functions/blob/dev/sendfn/typescript/src/email/service.ts) and [edge adapter](https://github.com/21nCo/super-functions/blob/dev/sendfn/typescript/src/edge.ts).
