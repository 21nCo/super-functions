# PlugFn OAuth Shared-Stack Migration

## Scope

The legacy `plugfn/auth/oauth-flow` import remains available for one minor release only as a compatibility shim.

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

## Removal target

- Deprecated now: `plugfn/auth/oauth-flow`
- Planned removal target: `plugfn@0.2.0`

## Remaining allowed behavior in the legacy module

The legacy module is intentionally narrow. It may still:

- emit the `DEPRECATED_PATH` warning
- expose the deprecation notice metadata
- delegate legacy method calls to a compatibility delegate

It must not own:

- token exchange orchestration
- refresh orchestration
- callback state verification logic
- provider descriptor translation logic
- default business storage semantics beyond delegation wiring

## Migration note

If you previously relied on `plugfn/auth/oauth-flow`, move new integration code onto the shared packages directly. The shim is only for short-term compatibility during the migration window.
