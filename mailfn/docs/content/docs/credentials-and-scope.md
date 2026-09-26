---
title: Credentials and scope
description: Use one-time inbox credentials and narrow API permissions.
---

# Credentials and scope

Create inboxes with a project credential authorized for that action, then use the returned one-time inbox credential for the inbox's subsequent read and wait operations. Store it as a secret; do not log or display it by default. Revoke scoped tokens when a fixture or agent task ends.

The CLI sanitizes text and JSON output by command. It redacts credentials, webhook secrets, raw data, message bodies, and verification values by default. `--show-secrets` explicitly reveals one-time credentials; `--show-content` explicitly reveals message content. The MCP server exposes narrow tools and redacted results; give agents only inbox-scoped credentials for their task.

Public-platform outbound remains denied without explicit production-security approval, and verified sender domains are required by default. Review the [threat model](/docs/reference/threat-model) and [operations guide](/docs/reference/operations) for bootstrap, token, domain, webhook, and retention responsibilities.
