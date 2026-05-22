---
title: Skills
description: Pre-baked filefn workflows your AI assistant can run on your behalf — install, configure, debug, extend.
---

# Skills

A "skill" is a small, self-contained recipe an AI assistant can run end-to-end. filefn ships skills for the most common workflows.

| Skill | What it does |
| --- | --- |
| `filefn-install` | Detects your framework, installs filefn, adds the route mount, writes a sample policy. |
| `filefn-add-storage` | Replaces the default local FS storage with S3 / GCS / R2 / MinIO. |
| `filefn-add-processor` | Adds a bundled processor (thumbnails, OCR, video) to your config. |
| `filefn-add-share-links` | Wires share-link UI components into your app. |
| `filefn-debug-upload` | Walks the upload state machine to diagnose stuck uploads. |
| `filefn-write-processor` | Scaffolds a custom `Processor` with tests. |
| `filefn-add-tenant-isolation` | Adds tenant scoping to storage paths, quotas, and authorizer. |
| `filefn-migrate-from` | Migrates from UploadThing / Roll-your-own / Direct S3 to filefn. |

## Discoverability

Skills are exposed via the MCP server (`list_skills` tool) and as static markdown under `https://docs.filefn.dev/skills/`. AI assistants that support skills (Claude Code, Cursor, Droid) discover them automatically once the MCP server is registered.

## Authoring your own

Skills are markdown files with a frontmatter header:

```md
---
name: filefn-add-watermark-processor
description: Add an image watermarking processor to your filefn config.
inputs:
  - name: watermark_path
    description: Path to the PNG watermark.
    type: string
---

# Steps

1. Read filefn server config.
2. Add a `createWatermarkProcessor` import.
3. Insert the processor into `processing.processors`.
4. Run tests.
```

Drop them under your project's `.factory/skills/` directory and the assistant picks them up.

## See also

- [Cursor](./cursor), [Claude](./claude), [Codex](./codex) — how each tool consumes skills.
