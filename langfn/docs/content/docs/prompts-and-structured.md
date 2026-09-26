---
title: Prompts and structured output
description: Format prompt templates and validate model output.
---

# Prompts and structured output

`langfn/prompts` exports string and chat templates, a registry, and few-shot helpers. Use `PromptTemplate` for named substitutions, and keep application-owned prompt versions alongside code or a trusted registry. The getting-started example formats a template before calling `complete`.

`langfn/structured` exports structured-output helpers. Model output is untrusted input: validate it against the expected schema and handle parse or schema failures as ordinary workflow errors. Do not grant privileges based only on a model's claimed result.

Read [prompt exports](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/prompts/index.ts) and [structured-output source](https://github.com/21nCo/super-functions/blob/dev/langfn/typescript/src/structured/output.ts) for constructor and validation details.
