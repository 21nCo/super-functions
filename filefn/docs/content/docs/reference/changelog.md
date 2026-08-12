---
title: Changelog
description: Notable filefn releases and migration notes.
---

# Changelog

filefn follows semver. Breaking changes are flagged.

For per-package changelogs (under `filefn/server`, `filefn/client`, `filefn/processing`, etc.), check the package's `CHANGELOG.md` or the GitHub release notes.

## 0.1.x — initial public preview

- Multipart uploads with signed-URL and proxy modes.
- Policies, visibility, storage targets, render intents, artifacts.
- Bundled processors: thumbnails, PDF previews, OCR, image transforms, video, audio, compression.
- DB adapters: memory, Drizzle, Postgres, SQLite, MySQL.
- Storage adapters: local FS, S3, GCS, Azure, R2, MinIO.
- Python kernel parity via `filefn` (PyPI).
- Native Swift package (`FileFnClient`, `FileFnSwiftUI`, `FileFnWebViewBridgeHost`).
- WKWebView bridge protocol `filefn-bridge/v1`.
- OPFS offline pipeline in `@filefn/client`.
- HEIC preprocessing on browser and native.

## See also

- [GitHub releases](https://github.com/21nCo/super-functions/releases) — full release notes.
