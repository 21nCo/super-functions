---
title: CLI and MCP
description: Operate inboxes with sanitized CLI output and narrow agent tools.
---

`@mailfn/cli` ships the `mailfn` command for inbox create/list/get/delete, message list/read/attachments/wait/extract, token revoke, domain create/verify, and operations. It uses `@clifn/core` and applies command-aware sanitization in text and JSON modes.

The following shell example requires `jq`; it captures the explicitly revealed credential without printing it and uses the inbox-scoped token for subsequent calls.

```sh
export MAILFN_URL=https://mail.example.com
# MAILFN_PROJECT_TOKEN must already contain a project token allowed to create inboxes.
created=$(MAILFN_TOKEN="$MAILFN_PROJECT_TOKEN" mailfn inbox create --expires 3600 --idempotency-key run-123 --json --show-secrets)
export MAILFN_TOKEN=$(printf '%s' "$created" | jq -er '.credential.token')
inbox_id=$(printf '%s' "$created" | jq -er '.inbox.id')
unset created
mailfn message wait "$inbox_id" --sender-domain example.com --subject Verify --timeout 30000
mailfn message extract "$inbox_id" msg_123 # Use the message ID returned by wait.
```

`@mailfn/mcp` ships `mailfn-mcp` for expiring inbox creation, message wait/list/read, OTP/link extraction, and token revocation. Tool outputs are redacted by default, and sensitive values require an explicit read or extract action. Give the process an inbox-scoped token with only required scopes. See [CLI reference](/docs/reference/cli) and [MCP reference](/docs/reference/mcp).
