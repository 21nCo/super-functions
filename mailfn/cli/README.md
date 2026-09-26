# `@mailfn/cli`

Least-privilege MailFn CLI built with `@clifn/core`.

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

Commands cover inbox create/list/get/delete, message list/read/attachments/wait/extract, token revoke, domain create/verify, and operations. Text and `--json` output pass through the same command-aware sanitizer. Message bodies, raw data, credentials, webhook secrets, and verification values are redacted by default. `message extract` is an explicit content action; `--show-content` explicitly opts into message content and `--show-secrets` explicitly reveals one-time credentials.
