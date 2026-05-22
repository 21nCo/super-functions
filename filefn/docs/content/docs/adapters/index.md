---
title: Adapters
description: filefn talks to the outside world through three adapter interfaces — storage, db, and processors. Each one is a small, well-defined contract you can swap.
---

# Adapters

filefn is built on three adapter interfaces:

| Interface | Owns | Bundled implementations |
| --- | --- | --- |
| `StorageAdapter` | Where bytes live and how they're addressed. | local FS, S3, GCS, Azure Blob, R2, MinIO |
| `Adapter` (db) | Where rows live (sessions, files, versions, artifacts, grants, share links). | memory, Drizzle, Postgres, SQLite, MySQL |
| `Processor` | Post-upload work (thumbnails, OCR, video transcode). | thumbnails, PDF previews, OCR, video, audio, image transforms, compression |

The kernel never reaches outside these contracts. If you can implement them, filefn can run on your stack.

## Pages in this section

- [Storage adapters overview](./storage)
- [Local FS](./storage-local) — dev / single-instance.
- [S3](./storage-s3) — production bucket on AWS.
- [GCS](./storage-gcs) — production bucket on Google Cloud.
- [Azure Blob](./storage-azure) — production bucket on Azure.
- [Cloudflare R2](./storage-r2) — S3-compatible R2.
- [MinIO](./storage-minio) — self-hosted S3-compatible.
- [DB adapters overview](./db)
- [Memory](./db-memory) — tests, CI, ephemeral demos.
- [Drizzle](./db-drizzle) — Drizzle ORM with PG/SQLite/MySQL.
- [Postgres](./db-postgres) — direct `pg` adapter.
- [SQLite](./db-sqlite) — local file or in-memory.
- [Processors](./processors) — bundled processor catalog.

## See also

- [Reference › Schema](../reference/schema) — tables every db adapter must support.
- [Core Concepts › Storage targets](../core-concepts/storage-targets) — multi-adapter routing.
