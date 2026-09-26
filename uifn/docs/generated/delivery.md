# Package and source delivery

Package mode imports stable subpaths from `@uifn/components-react`, `@uifn/components-svelte`, or `@uifn/components-solid`. Source mode uses the signed offline catalog in `@uifn/registry` and records source ownership and hashes in `.uifn/registry.lock`. Both modes expose the same named parts and compound root contract.

## Source installation

Install the CLI as a development dependency in your consumer project. The `@uifn/registry` package provides the `uifn` executable; use `npx --no-install` to run that local installation.

```sh
npm install --save-dev @uifn/registry
npx --no-install uifn add button --framework react --cwd . --dry-run --json
npx --no-install uifn add button --framework react --cwd . --json
npx --no-install uifn diff --cwd . --json
npx --no-install uifn update button --cwd . --dry-run --json
```

Dry run shows the exact plan without writing. Add and update validate catalog signatures, package dependencies, workspace ownership, source hashes, and dirty-file conflicts before an atomic write. Local edits are never silently overwritten.

## Npm lockfiles after dependency changes

Whenever `uifn add`, `uifn update`, or `uifn apply` changes `package.json` in a project with `package-lock.json`, refresh the npm lockfile. `apply` reports `requiredActions`; `add` and `update` do not, so inspect the package diff yourself.

Run `npm install --package-lock-only --ignore-scripts --lockfile-version=3`, review the diff, then run `npm ci`. UIFn does not run npm or edit the npm lockfile during its file transaction.
