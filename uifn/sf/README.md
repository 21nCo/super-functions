# @uifn/sf

Superfunction-backed pattern variants for `uifn`.

Backed patterns use injected client contracts for Superfunctions such as `authfn`, `plugfn`, `filefn`, and `billfn`. They do not import app-global clients or secrets.

Status: **experimental**. This package is independently versioned, published under the `experimental` dist-tag, and cannot block or be bundled into the stable uifn release lane.

Its gate is `npm run verify:uifn-sf`. Results are reported separately from `npm run verify:uifn-stable`.

## Client contracts

- `AuthFnClient`: `getAuthPanelData`, `listApiKeys`, `listSessions`, `getUserProfile`, optional `createApiKey`, `revokeApiKey`, `revokeSession`, `updateProfile`, `signIn`, `signOut`, and `switchAccount`.
- `PlugFnClient`: `listProviders`, `listConnections`, `listWebhookEndpoints`, optional `connectProvider`, `disconnectConnection`, `createWebhookEndpoint`, `rotateWebhookSecret`, and `deleteWebhookEndpoint`.
- `FileFnClient`: `listFiles`, `listUploads`, `getQuotaUsage`, optional `uploadFiles`, `cancelUpload`, `openFile`, `removeFile`, and `upgradeQuota`.
- `BillFnClient`: `listPlans`, `getSubscription`, `listInvoices`, optional `selectPlan`, `manageSubscription`, `cancelSubscription`, and `downloadInvoice`.

## Phase-one backed variants

- `authfn`: `AuthFnAuthPanel`, `AuthFnApiKeyTable`, `AuthFnSessionList`, `AuthFnUserProfileCard`.
- `plugfn`: `PlugFnProviderPicker`, `PlugFnOAuthConnectionsPanel`, `PlugFnWebhookEndpointTable`.
- `filefn`: `FileFnFileDropzonePanel`, `FileFnUploadProgressList`, `FileFnFileListPanel`, `FileFnQuotaUsagePanel`.
- `billfn`: `BillFnBillingPlanCards`, `BillFnSubscriptionStatusPanel`, `BillFnInvoiceTable`.

Backed variants require injected client props and never read app-global clients. Storybook uses `createSuperfunctionMockDecorator()` with fake tenants and fake mock clients.

Current backend API gaps: none for this UI contract layer. Real service adapters can be implemented outside `@uifn/sf` as long as they satisfy these narrow contracts.

## Package-local release checks

Publish the exact `@uifn/patterns` dependency version under `experimental`
before installing this package in isolation. For pre-publication checks,
install the packed patterns tarball as the dependency; do not alias imports
to sibling source, because that hides missing package exports and declarations.

From this package directory, run
`npm install --workspaces=false --package-lock=false`, then
`npm run typecheck`, `npm test`, `npm run build`, and `npm pack --json`.
Packing repeats the typecheck, injected-client/model/story tests, and build.
Story fixtures are resolved relative to this package, independent of the
checkout layout. The repository-wide experimental gate remains separate.
This does not authorize publishing sf or moving either package to `latest`.
