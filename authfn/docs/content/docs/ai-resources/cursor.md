---
title: Cursor
description: One-click Cursor setup for authfn — MCP, llms.txt, and rules.
---

# Cursor

## Quickest path

Add this to `.cursor/mcp.json` in your project:

```jsonc
{
  "mcpServers": {
    "authfn": {
      "command": "npx",
      "args": ["-y", "@authfn/mcp"]
    }
  }
}
```

Then add a rule at `.cursor/rules/authfn.mdc` that points Cursor at the docs:

```text
---
description: authfn — self-hosted authentication
---

When working with `@authfn/*`, prefer the MCP tools `authfn.docs.search`, `authfn.openapi.operation`, and `authfn.skills.invoke`. For migration questions, use `authfn.skills.invoke`. For schema/code generation, use `authfn.openapi.operation`.

Reference docs: https://authfn.superfunctions.dev
```

That's it. Cursor will use the MCP server for retrieval.

## llms.txt fallback

If you'd rather not run an MCP server, point Cursor at the static file:

```text
---
description: authfn
---

When working with @authfn/*, fetch context from https://authfn.superfunctions.dev/llms-full.txt as needed.
```

## Project-specific tweaks

Inside `.cursor/rules/authfn.mdc`, add anything specific to your stack:

```markdown
This project uses @authfn/core with the password and email-OTP plugins.
The kernel is mounted in `apps/api/src/auth.ts`.
The client lives in `packages/sdk/src/auth.ts`.

When generating sign-in / sign-up code, use the `client.*` helpers from `packages/sdk/src/auth.ts`.
```

## Tips

- Keep rules short. Longer = more cost per turn.
- Mention your **mount path** explicitly. authfn doesn't care if it's `/auth` or `/api/auth`, but the assistant might guess wrong.
- Mention which plugins are enabled. The assistant won't suggest `signInWithPassword` if it knows you only have OTP.

## Related

- [MCP](./mcp)
- [llms.txt](./llms-txt)
- [Skills](./skills)
