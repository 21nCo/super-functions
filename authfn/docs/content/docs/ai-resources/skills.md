---
title: Skills
description: Packaged authfn patterns your assistant can apply on request — sign-in flows, OAuth, multi-region, and more.
---

# Skills

A **skill** is a small, self-contained context pack: prompt, sample code, and links to the relevant doc pages. Your assistant can call `authfn.skills.invoke` with a skill name and the user's request; the response is a focused playbook, not a full RAG dump.

Skills are how you prevent your assistant from synthesizing an outdated or wrong-shaped solution.

## Bundled skills

| Skill | When the assistant should pick it |
| --- | --- |
| `add-password-auth` | "Add email/password sign-in to my app." |
| `add-otp-sign-in` | "Add magic-link or OTP sign-in." |
| `add-social-oauth` | "Let users sign in with Google / Apple / GitHub." |
| `add-2fa` | "Enable two-factor auth." |
| `add-api-keys` | "Issue API keys for our CLI." |
| `add-multi-region` | "Set up authfn in EU + US." |
| `add-native-handoff` | "Hand off web sign-in to my iOS app." |
| `migrate-from-better-auth` | "Move from Better Auth." |
| `migrate-from-clerk` | "Move from Clerk." |
| `migrate-from-authjs` | "Move from Auth.js / NextAuth." |

## Anatomy of a skill

```jsonc
{
  "id": "add-2fa",
  "title": "Add 2FA to an existing authfn app",
  "applicability": ["authfn", "two-factor"],
  "context": [
    "docs/plugins/two-factor.md",
    "docs/recipes/adding-2fa.md"
  ],
  "playbook": [
    "1. Install: `npm install @authfn/core @authfn/client`",
    "2. Add `authFnTwoFactorPlugin` to your `createAuthFn({ plugins })` array.",
    "3. Generate schema: `npx superfunctions auth schema`",
    "4. UI: enroll → confirm → challenge. See recipes/adding-2fa.md.",
    "5. Encryption: provide an `encryptionKeyResolver`."
  ]
}
```

When invoked, the assistant gets:

- The full text of every `context` page.
- The structured `playbook`.
- The user's question.

…and is told to produce code that follows the playbook precisely.

## Authoring skills

In `authfn/docs/content/skills/`:

```jsonc
// authfn/docs/content/skills/my-skill.json
{
  "id": "my-skill",
  "title": "My custom skill",
  "applicability": ["..."],
  "context": ["docs/plugins/...", "docs/recipes/..."],
  "playbook": ["1. ...", "2. ..."]
}
```

Build:

```bash
npm run docs:skills    # validates and emits dist/skills.json
```

Once the MCP server picks it up, every assistant connected to it can invoke the new skill.

## Why not just RAG?

RAG retrieves *similar* text. A skill encodes the *correct* approach. For framework auth, "similar text" frequently surfaces the wrong pattern — e.g., the assistant decides to roll its own session table because the docs mention `users` and `sessions`. Skills short-circuit that by giving the assistant a vetted playbook and a curated context window.

## Related

- [MCP](./mcp) — how skills are invoked.
- [llms.txt](./llms-txt) — static alternative.
