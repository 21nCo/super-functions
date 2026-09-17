---
title: Changelog
description: Release history of authfn and @authfn/* packages.
---

# Changelog

The canonical source for changes is the [GitHub Releases page](https://github.com/21nCo/super-functions/releases?q=authfn).

The Node kernel package is **`authfn`**. Plugin packages (`@authfn/password`, `@authfn/email-otp`, `@authfn/social-oauth`, `@authfn/api-keys`, `@authfn/two-factor`, `@authfn/multi-region`, `@authfn/native-handoff`) and client packages (`@authfn/client`, `@authfn/svelte`, `@authfn/admin`) release independently.

The Python kernel keeps a package changelog at `authfn/python/CHANGELOG.md`.

## Release cadence

Packages are released independently. The version of `authfn` is the canonical Node kernel version. The client, Svelte, Python, and Swift SDKs track the kernel's wire format (envelopes, error codes), not its TypeScript surface — so they release on a slower cadence.

## Stability commitment

- **Wire format**: stable across minor versions. We add new operations, new error codes, new event types; we don't rename or change the shape of existing ones without a major bump.
- **Envelope shape**: stable across all versions of v0.x.
- **Error codes**: only added — never removed or renamed in a minor.
- **Database schema**: additive in minors. Removals or renames require a major + a generated migration script.
- **Plugin authoring API**: still 0.x — small breaking changes are possible. Watch `authfn` plugin-contract release notes.

## Migration notes

When a release requires action, you'll find a numbered "Migration" section in the GitHub release notes.

## Subscribing

Watch the `21nCo/super-functions` repo on GitHub with **Releases only** to be notified.
