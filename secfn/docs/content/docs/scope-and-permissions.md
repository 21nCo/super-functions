---
title: Scope and permissions
description: Enforce tenant, namespace, environment, and operator boundaries.
---

# Scope and permissions

The host derives `tenantId`, namespace, actor identity, IP, and related request context from trusted authentication. A request's query or body may narrow trusted scope but cannot replace it. Namespace-scoped contexts require a tenant ID because namespace slugs are only unique within a tenant. A fixed namespace also constrains admin collections, service-token revocation, and environment creation.

`authorize(ctx, action, details)` decides each admin action. The router rejects absent or denied authorization and records permission-denied audit events. A global operator context without fixed tenant or namespace is a deliberate host privilege; do not derive it from arbitrary request fields.

Runtime service tokens are created through admin routes and verified against the requested secret scope. The runtime client sends the bearer token and configured tenant and namespace headers. Select environments through the client configuration or a per-call option. The server rejects conflicting namespace names or IDs and checks set members against the resolved runtime scope.

Read the [server contract](/docs/reference/server) for detailed namespace, environment, and secret-set behavior. Mounting the router is not an authentication policy: the host must supply its own principal resolution and admin permission decisions.
