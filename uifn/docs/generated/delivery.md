# Package and source delivery

Package mode imports stable subpaths from `@uifn/components-react`, `@uifn/components-svelte`, or `@uifn/components-solid`. Source mode uses the signed offline catalog in `@uifn/registry` and records source ownership and hashes in `.uifn/registry.lock`. Both modes expose the same named parts and compound root contract.

## Source installation

```sh
uifn add button --framework react --cwd . --dry-run --json
uifn add button --framework react --cwd . --json
uifn diff --cwd . --json
uifn update button --cwd . --dry-run --json
```

Dry run shows the exact plan without writing. Add and update validate catalog signatures, package dependencies, workspace ownership, source hashes, and dirty-file conflicts before an atomic write. Local edits are never silently overwritten.

## Npm lockfiles after preset apply

If `uifn apply` changes dependencies in a project with `package-lock.json`, review the reported `requiredActions`. Refresh the lockfile with `npm install --package-lock-only --ignore-scripts --lockfile-version=3`, review the diff, then run `npm ci`. UIFn does not run npm or edit the npm lockfile during its file transaction.
