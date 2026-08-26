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
