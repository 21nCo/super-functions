---
title: Recipes
description: Production-tested filefn patterns — opinionated, end-to-end, copy-and-adjust.
---

# Recipes

Each recipe is a complete, production-tested pattern for a real problem. Copy it, adjust it, ship it.

| Recipe | Solves |
| --- | --- |
| [Image uploads](./image-uploads) | Avatars, gallery covers, attachments — with thumbnails, EXIF stripping, HEIC handling. |
| [Document uploads](./document-uploads) | PDF, DOCX, plain text — with previews and OCR. |
| [Video uploads](./video-uploads) | Long-running video uploads with poster frames and transcoding. |
| [OPFS offline](./opfs-offline) | Reliable uploads even when the network is bad. |
| [HEIC conversion](./heic-conversion) | iPhone photos in browsers and on iOS. |
| [CDN integration](./cdn-integration) | Front S3 / GCS / R2 with CloudFront / Cloud CDN / Cloudflare. |
| [Virus scanning](./virus-scanning) | ClamAV-as-a-processor pattern. |
| [Signed share links](./signed-share-links) | Tokenised public links with TTL and download caps. |
| [Custom processor](./custom-processor) | Author and ship your own processor. |
| [Tenant isolation](./tenant-isolation) | Per-tenant storage paths, quotas, and grants. |
