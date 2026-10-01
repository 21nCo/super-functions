---
title: Operations and limits
description: Supported browser targets, manual steps, and validation boundaries.
---

ExtFn supports Chromium MV3 and Firefox MV3. Side-panel and other capabilities vary by target. Development output is an unpacked extension; Firefox loading remains manual after `--open`. Production archives are `.zip` for Chromium and `.xpi` for Firefox.

CLI scans are strict by default but are limited to emitted files and manifests. Review permissions, CSP, externally connectable scope, privacy claims, and store listing content before release. A successful local scan or build does not prove installation, browser behavior, or store approval.

Keep domain operations in their owner packages. The ExtFn runtime and CLI provide extension infrastructure; `@datafn/extfn` is a separate integration. The admin package currently marks its capability unavailable. See [reference guides](/docs/reference) for exact CLI behavior and content patterns.
