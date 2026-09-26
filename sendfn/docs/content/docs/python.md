---
title: Python SDK
description: Install channel extras and configure a Python client.
---

# Python SDK

The separately versioned Python package supports email, push, and SMS. Install only the extras needed by the host:

```sh
pip install sendfn[email]
# or: pip install sendfn[push] sendfn[fastapi]
```

Create a `SendfnConfig` with a database adapter and channel configuration, then call `create_sendfn`. `MemoryAdapter` is useful for tests; production SQLAlchemy hosts can use the schema helpers and a durable adapter. The [Python source guide](/docs/reference/python) contains complete examples, template registration, suppression management, and event queries. Check the Python package's exact feature list before assuming parity with TypeScript.
