---
title: Sessions
description: How authfn establishes, refreshes, and revokes user sessions.
---

# Sessions

authfn issues a **session** when a user successfully authenticates and verifies it on subsequent requests. Sessions are cookie-backed by default (with CSRF protection); token-based mode is available when you need to authenticate non-browser clients.

> Stub page — fill in with: cookie semantics, rotation, revocation, idle/absolute timeouts, multi-device, session storage.
