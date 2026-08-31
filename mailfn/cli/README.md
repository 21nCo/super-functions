# `@mailfn/cli`

Least-privilege MailFn CLI built with `@clifn/core`.

```sh
MAILFN_URL=https://mail.example.com MAILFN_TOKEN=... mailfn inbox create --expires 3600 --idempotency-key run-123
mailfn message wait inb_123 --sender-domain example.com --subject Verify --timeout 30000
mailfn message extract inb_123 msg_123
mailfn operations --json
mailfn inbox create --json --show-secrets # explicit one-time credential reveal
```

Commands cover inbox create/list/get/delete, message list/read/wait/extract, token revoke, domain create/verify, and operations. Text and `--json` output pass through the same command-aware sanitizer. Message bodies, raw data, credentials, webhook secrets, and verification values are redacted by default. `message extract` is an explicit content action; `--show-content` explicitly opts into message content and `--show-secrets` explicitly reveals one-time credentials.
