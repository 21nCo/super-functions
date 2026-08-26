# Removed-framework migration

The last repository package version that included `@uifn/vue` and `@uifn/angular` was `0.0.1`. Both packages and all associated workbenches, catalogs, generated templates, registry choices, tests, release rows, dependencies, and supported-product documentation are removed for the breaking three-framework release.

## Impact

- Imports from `@uifn/vue`, `@uifn/angular`, `@uifn/components/vue`, or `@uifn/components/angular` no longer resolve.
- The registry CLI accepts only `react`, `svelte`, and `solid`.
- Selecting `vue` or `angular` returns `UIFN_REGISTRY_UNSUPPORTED_FRAMEWORK` before creating directories, files, or lock entries.
- There are no deprecated proxies, runtime warnings, compatibility wrappers, or source-install shims.

Applications that remain on either removed framework must stay on the last compatible pre-GA package version or migrate their UI layer before adopting the new uifn package family. Historical audit and evidence records remain in `.conduct`; they are not supported product surfaces.
