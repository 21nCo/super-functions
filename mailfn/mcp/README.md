# `@mailfn/mcp`

Agent-safe MCP server for focused MailFn workflows.

```sh
MAILFN_URL=https://mail.example.com MAILFN_TOKEN=... mailfn-mcp
```

Tools cover expiring inbox creation, message wait/list/read, OTP/link extraction, and token revocation. Tool schemas are narrow, results are redacted by default, and content or verification values require an explicit read/extract action. Give agents inbox-scoped credentials containing only the scopes needed for their task.
