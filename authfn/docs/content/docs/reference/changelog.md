---
title: Changelog
description: Release history of @authfn/* packages.
---

# Changelog

The canonical source for changes is the [GitHub Releases page](https://github.com/21nCo/super-functions/releases?q=authfn) and the per-package `CHANGELOG.md` files in the source tree:

- `authfn/core/CHANGELOG.md`
- `authfn/client/CHANGELOG.md`
- `authfn/svelte/CHANGELOG.md`
- `authfn/python/CHANGELOG.md`
- `authfn/swift/CHANGELOG.md`
- `authfn/admin/CHANGELOG.md`

## Release cadence

The packages are released independently; the version of `@authfn/core` is the canonical kernel version. The client, SvelteKit, Python, and Swift SDKs track the kernel's wire format (envelopes, error codes), not its TypeScript surface — so they release on a slower cadence.

## Stability commitment

- **Wire format**: stable across minor versions. We add new operations, new error codes, new event types; we don't rename or change the shape of existing ones without a major bump.
- **Envelope shape**: stable across all versions of v0.x.
- **Error codes**: only added — never removed or renamed in a minor.
- **Database schema**: additive in minors. Removals or renames require a major + a generated migration script.
- **Plugin authoring API**: still 0.x — small breaking changes are possible. Watch `@authfn/plugin-types`'s release notes.

## Migration notes

When a release requires action, you'll find a numbered "Migration" section in the GitHub release notes and a corresponding `MIGRATIONS.md` entry inside the package.

## Subscribing

Watch the `21nCo/super-functions` repo on GitHub with **Releases only** to be notified.
