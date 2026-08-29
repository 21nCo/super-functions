# `@mdfn/filefn`

Storage-neutral asset contracts plus the production FileFn client bridge for
selection, upload, resolution, document association, rendering, and cleanup.
Every operation can be authorized by the host, references are bound to a
document, durable references omit delivery URLs, and resolved URLs pass the
shared MDFN URL policy before rendering.

`createAssetGateway` enforces the contract for any provider.
`createFileFnAssetProvider` bridges the real FileFn client. The deterministic
memory provider exists only for tests and examples and is not durable storage.
