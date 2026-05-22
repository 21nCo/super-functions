---
title: Claude
description: Wire filefn into Claude Desktop and Claude Code — MCP server, CLAUDE.md, and recommended hints.
---

# Claude

## Claude Desktop

In `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "filefn": {
      "type": "http",
      "url": "https://docs.filefn.dev/mcp"
    }
  }
}
```

Restart Claude Desktop. The MCP tools panel now lists filefn search / fetch.

## Claude Code

```bash
claude mcp add filefn https://docs.filefn.dev/mcp --type http
```

Or use Droid's wrapper:

```bash
droid mcp add filefn https://docs.filefn.dev/mcp --type http
```

## CLAUDE.md

Drop a `CLAUDE.md` into your repo root:

```md
# filefn

This repo uses **filefn** for file uploads, processing, and previews.

Key packages:
- `@filefn/server` — server kernel (createFileFn, FileProvider, Authorizer).
- `@filefn/client` — browser/Bun/Deno client (uploadFile, resumeUpload, resolveRenderable).
- `@filefn/processing` — bundled processors (thumbnails, PDF, OCR, image transforms, video, audio).
- `FileFnClient` (Swift) — native iOS/macOS client.

Common operations:
- New upload: `client.uploadFile({ policy, file })` returns an `UploadHandle`.
- Resumable: `client.resumeUpload(uploadSessionId, file, { uploadSessionToken })`.
- Render: `client.resolveRenderable({ fileId, intent: "preview" })`.
- Server routes: mount `fileFn.router.handle(request)`.

For docs, use the filefn MCP server (`search_docs`, `fetch_page`, `get_route`, `get_error`).
For workflows, use filefn skills (`list_skills` then `run_skill`).

Common error codes:
- `FILEFN_POLICY_NOT_FOUND` — policy name doesn't exist.
- `FILEFN_POLICY_MAX_SIZE_EXCEEDED` — file too large for policy.
- `FILEFN_UPLOAD_SESSION_EXPIRED` — session past TTL.
- `FILEFN_QUOTA_EXCEEDED` — storage quota hit.
```

Claude reads `CLAUDE.md` on every conversation in that repo and uses it to ground its answers.

## See also

- [MCP server](./mcp).
- [Skills](./skills).
