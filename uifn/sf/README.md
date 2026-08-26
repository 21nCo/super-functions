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
