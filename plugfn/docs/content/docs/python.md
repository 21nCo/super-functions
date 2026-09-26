---
title: Python runtime
description: Assess the experimental Python surface per provider.
---

# Python runtime

The Python `plugfn` package is an experimental baseline. It exports the declared core provider set of GitHub, Linear, ClickUp, and Gmail, but does not match the full TypeScript provider surface.

```sh
pip install plugfn
```

The [Python source guide](https://github.com/21nCo/super-functions/blob/dev/plugfn/python/README.md) shows its setup shape. Check the matrix's Python column for each provider and avoid assuming parity with TypeScript.
