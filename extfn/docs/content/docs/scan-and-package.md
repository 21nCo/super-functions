---
title: Scan and package
description: Interpret strict findings and produce extension archives.
---

# Scan and package

`extfn scan` examines built manifests and files for remote code, insecure transport, dynamic execution, risky permissions, externally connectable scope, CSP issues, content-script sockets, and store-readiness reminders. Findings include rule ID, severity, category, actionability, target, message, and optional file and details. Reports can be text, JSON, or SARIF.

Strict mode returns a nonzero exit code for error findings. `--no-strict` does not hide findings; it only changes the command result and whether `package` can emit an archive. `package --no-scan` bypasses the scanner entirely. Default packaging runs the scanner first and blocks archives on error findings.

The scanner is a local static check of emitted artifacts. It cannot prove that store review, browser permissions, network behavior, or extension runtime behavior will pass in a deployed browser. Run the [example validation matrix](/docs/reference/cli) and inspect the generated manifest and [scan report contract](/docs/reference/scan) before distribution.
