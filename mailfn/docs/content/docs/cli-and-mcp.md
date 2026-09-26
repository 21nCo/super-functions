---
title: CLI and MCP
description: Operate inboxes with sanitized CLI output and narrow agent tools.
---

# CLI and MCP

`@mailfn/cli` ships the `mailfn` command for inbox create/list/get/delete, message list/read/wait/extract, token revoke, domain create/verify, and operations. It uses `@clifn/core` and applies command-aware sanitization in text and JSON modes.

```sh
MAILFN_URL=https://mail.example.com MAILFN_TOKEN=... mailfn inbox create --expires 3600 --idempotency-key run-123
mailfn message wait inb_123 --sender-domain example.com --subject Verify --timeout 30000
mailfn message extract inb_123 msg_123
```

`@mailfn/mcp` ships `mailfn-mcp` for expiring inbox creation, message wait/list/read, OTP/link extraction, and token revocation. Tool outputs are redacted by default, and sensitive values require an explicit read or extract action. Give the process an inbox-scoped token with only required scopes. See [CLI reference](/docs/reference/cli) and [MCP reference](/docs/reference/mcp).
