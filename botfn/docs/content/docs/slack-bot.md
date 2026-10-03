---
title: Slack receiver
description: Verify Slack requests and understand the current event handler.
---

`@botfn/bot-slack` is a private Cloudflare Worker package with one route: `POST /slack/events`. It requires `SLACK_SIGNING_SECRET` and verifies Slack's `v0` HMAC signature against the raw body and request timestamp. The verifier rejects missing headers and timestamps outside a five-minute window.

The route returns a URL verification challenge when requested. For an event body, it logs the event type and responds `OK`. There are no Slack commands, message replies, or persistence writes in this entry point yet. `SLACK_BOT_TOKEN` is declared in the binding type but is not used by this route.

Use `npm --workspace @botfn/bot-slack run dev` for a local Worker and `npm --workspace @botfn/bot-slack run deploy:cloudflare` to deploy once its secrets and Slack app endpoint are configured. A local typecheck/build is `npm --workspace @botfn/bot-slack run build`.

If you add event handling, keep signature verification before JSON parsing, handle retries and idempotency for side effects, and use the host's own authorization model. The [Worker entry](https://github.com/21nCo/super-functions/blob/dev/botfn/bot-slack/src/index.ts) and [verifier](https://github.com/21nCo/super-functions/blob/dev/botfn/slack-core/src/verify.ts) are the current contract.
