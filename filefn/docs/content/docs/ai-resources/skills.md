---
title: Application-owned recipes
description: Create and review local FileFn assistant recipes; no bundled executable skill endpoint is supplied.
---

# Application-owned recipes

The docs site does not publish executable FileFn skills, a `/skills/` endpoint, or `list_skills`/`run_skill` tools. Write recipes for your own assistant's documented skill format and review them as application code.

A useful recipe can:

1. Inspect installed FileFn versions and existing server configuration.
2. Read the relevant [documentation](https://filefn.com/docs) or [LLM context files](./llms-txt).
3. Propose a narrowly scoped configuration or processor change.
4. Run the project's tests and type checks.
5. Obtain separate authorization before operating live storage or infrastructure.

FileFn policy checks and tenant authorization still apply. Assistant instructions are not credentials and do not bypass server-owned access control. Skill installation, discovery, and execution are specific to your assistant and are not implemented by this docs build.
