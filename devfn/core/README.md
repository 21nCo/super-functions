# @devfn/core

Builds dependency-ordered lifecycle plans, reserves ports before mutation, starts Compose and native resources, verifies readiness, registers shared proxy routes, emits machine-readable receipts, and rolls back only resources created by the failing invocation.

`resolveEndpointTemplates` runs before startup. Generated `DEVFN_*` values and native loopback bind values win over profile and node literals; profile references resolve before node overrides, and explicit `{{env.NAME}}` references resolve in their selected consumer context. Native processes receive host-loopback `DEVFN_URL_*` values. Compose services receive DNS URLs only for HTTP services in their own Compose project; references to a native loopback endpoint or another Compose project fail before state mutation. An independent Compose project simply omits unreachable sibling URLs.

Compose command readiness executes on the host. Its argv and `readinessEnvironment` therefore use host-loopback URLs, while `environment` retains the container URLs used for Compose interpolation. Startup, status, and retry use the same host-side values. HTTP readiness uses a directly reachable leased endpoint before selected proxy routes are installed. Credential-bearing manifest values must use `envAllowlist` and `secretEnv`; they are excluded from endpoint resolutions and receipts.
