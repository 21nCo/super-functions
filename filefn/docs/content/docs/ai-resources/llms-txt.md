---
title: llms.txt
description: Use the generated FileFn documentation indexes with an AI assistant.
---

# llms.txt

The docs build generates two text resources:

| URL | Contents |
| --- | --- |
| [`/docs/llms.txt`](/docs/llms.txt) | Page titles, descriptions, and links. |
| [`/docs/llms-full.txt`](/docs/llms-full.txt) | Full authored docs content. |

For a local copy after the site is deployed:

```sh
curl https://filefn.com/docs/llms.txt -o filefn-llms.txt
```

The generated indexes are also committed as `filefn/docs/static/llms.txt` and `filefn/docs/static/llms-full.txt`. During development, use those files directly. Regenerate them with `npm run generate:llms --workspace=@filefn/docs` after changing docs content.

The site does not generate `llms-rich.json`. The [search index](/docs/search.json) is a separate JSON resource used by site search.
