---
title: Security and isolation
description: Prepare the trusted runner, containers, credentials, and output boundary.
---

# Security and isolation

Treat repository files, issue text, test output, and model output as untrusted. The trusted boundary contains the installed CLI, base-revision policy, context collector, coordinator, and separate publisher. In CI, pass `--trusted-config-from-base` so a PR cannot change the policy or executable that evaluates itself.

Tests require a pinned Docker image with no network, no credentials, a read-only root, an unprivileged UID, and fixed CPU, memory, process, disk, and time limits. There is no host-execution fallback. PR inference requires the trusted `reviewfn-codex:0.154.0` image and an inference-only proxy; it must not receive a raw provider or GitHub publication token. Build that image from the packaged harness Dockerfile and provision the proxy before enabling reviews.

The review CLI refuses `GITHUB_TOKEN` in its environment. Put publication in a separate trusted job that reads a retained report and verifies the PR, head, and profile from event metadata. The CLI rejects changed auto-loaded agent instruction and configuration paths before inference. Locally trusted API-key and ChatGPT modes are not PR inference modes.

The [full security model](/docs/reference/security) records exact bounds, redaction, artifact retention, symlink protection, platform caveats, and cleanup rules. Review it before running against untrusted code.
