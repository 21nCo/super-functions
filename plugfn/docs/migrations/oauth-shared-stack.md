# PlugFn OAuth Shared-Stack Migration

## Scope

Version 0.2.0 removes the legacy `plugfn/auth/oauth-flow` compatibility module
and `OAuthFlowHandler` export. The announced one-minor-release migration window
is closed; no aliases or delegates remain.

## Replacement path

Replace legacy usage with the shared OAuth family:

- `@superfunctions/oauth-flow`
- `@superfunctions/oauth-http`
- `@superfunctions/oauth-storage`

These packages are the canonical path for:

- authorization request creation
- callback handling
- token exchange and refresh
- state persistence
- encrypted token persistence

## Completed cutover

The removal target was `plugfn@0.2.0`. The connection manager now uses
`createOAuthFlowService` from `@superfunctions/oauth-flow` directly.

Applications importing `OAuthFlowHandler` must construct the shared flow
service with their provider resolver, token HTTP client and state/token stores.
Authorization, callback verification, exchange, refresh and disconnect belong
to that service; do not recreate the deleted compatibility delegate.
