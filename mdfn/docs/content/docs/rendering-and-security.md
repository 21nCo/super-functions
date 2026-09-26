---
title: Rendering and security
description: Apply a rendering policy to untrusted Markdown.
---

# Rendering and security

`@mdfn/render` produces safe HTML or a render tree without a browser dependency. Raw HTML is disabled by default; enabling it requires an explicit sanitizer. Unsafe URL schemes are rejected, and resource limits apply before output is returned.

Treat Markdown imports, extension output, asset URLs, and AI suggestions as untrusted data. Render with an appropriate policy for the destination and inspect diagnostics before publishing. Do not bypass the renderer with raw HTML from a document or sidecar.

See [render](/docs/reference/render), [core](/docs/reference/core), [asset bridge](/docs/reference/filefn), and [AI bridge](/docs/reference/ai).
