# @uifn/patterns

Backend-agnostic product patterns for `uifn`.

Patterns accept explicit data, callbacks, and state props. Superfunction-backed variants live in `@uifn/sf`.

Status: **experimental**. This package is independently versioned, published under the `experimental` dist-tag, and cannot block or be bundled into the stable uifn release lane.

Its gate is `npm run verify:uifn-patterns`. Results are reported separately from `npm run verify:uifn-stable`.

## Patterns

- `AuthPanel(props)`
- `ApiKeyTable(props)`
- `SessionList(props)`
- `UserProfileCard(props)`
- `ProviderPicker(props)`
- `OAuthConnectionsPanel(props)`
- `WebhookEndpointTable(props)`
- `FileDropzonePanel(props)`
- `UploadProgressList(props)`
- `FileListPanel(props)`
- `QuotaUsagePanel(props)`
- `BillingPlanCards(props)`
- `SubscriptionStatusPanel(props)`
- `InvoiceTable(props)`

Each pattern accepts explicit data, `status`, and callback props. The supported controlled states are `loading`, `empty`, `error`, `partial`, `permission-denied`, `optimistic`, `success`, `degraded-network`, and `unsupported-capability`.

Pattern source installation metadata lives in `uifn/registry/catalog/patterns`, fixtures live in `uifn/patterns/fixtures`, and reusable story metadata lives in `uifn/patterns/stories`.

## Package-local release checks

From this package directory, install declared dependencies with
`npm install --workspaces=false --package-lock=false`, then run
`npm run typecheck`, `npm test`, `npm run build`, and `npm pack --json`.
Packing repeats the typecheck, deterministic model/story tests, and build.
The story tests resolve fixtures relative to this package rather than the
monorepo working directory. The repository-wide experimental gate remains
separate from these package-local checks.

`@uifn/patterns` must be published under `experimental` before an isolated
`@uifn/sf` install can resolve its exact prerequisite version. Validate a
packed patterns tarball first, then use that tarball when validating sf
before the prerequisite is available from npm. Never publish these packages
to `latest` or add their checks to the stable release lane.
