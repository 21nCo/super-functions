# LangFn

LangFn is the Superfunctions dual-language SDK for production LLM workflows. It ships aligned TypeScript and Python surfaces for model calls, prompts, tools, orchestration, state graphs, agents, RAG, observability, evaluation, HTTP routes, and MCP.

Current release target: `0.1.0`.

## Install

TypeScript:

```bash
npm install langfn@0.1.0
```

Python:

```bash
pip install langfn==0.1.0
```

## Package surfaces

- TypeScript root: `langfn`
- TypeScript subpaths: `langfn/models`, `langfn/prompts`, `langfn/tools`, `langfn/orchestration`, `langfn/graph`, `langfn/agents`, `langfn/observability`, `langfn/http`, `langfn/structured`, `langfn/rag`, `langfn/memory`, `langfn/evaluation`, `langfn/mcp`, `langfn/utils`
- Python root: `langfn`
- Python modules: `langfn.models`, `langfn.prompts`, `langfn.tools`, `langfn.orchestration`, `langfn.graph`, `langfn.agents`, `langfn.observability`, `langfn.http`, `langfn.structured`, `langfn.rag`, `langfn.memory`, `langfn.evaluation`, `langfn.mcp`

## Quick start

TypeScript:

```typescript
import { langfn } from "langfn";
import { MockChatModel } from "langfn/models";

const client = langfn({
  model: new MockChatModel({ responses: ["hello from langfn"] })
});

const result = await client.complete("Say hello");
console.log(result.content);
```

Python:

```python
import asyncio

from langfn import LangFn
from langfn.models import MockChatModel


async def main() -> None:
    client = LangFn(model=MockChatModel(responses=["hello from langfn"]))
    result = await client.complete("Say hello")
    print(result.content)


asyncio.run(main())
```

## Release verification

Run the LangFn release gate from the repository root:

```bash
npm run gate:langfn-release
```

This gate runs the TypeScript build, the full TypeScript and Python test suites, package import smoke checks, HTTP/MCP/observability smoke checks, and the LangFn duplication gate.

## More docs

- [Release contract](./SPEC.md)
- [Provider compatibility matrix](./COMPATIBILITY.md)
- [Release-gate checklist](./.conduct/release-gate.md)
- [TypeScript README](./typescript/README.md)
- [Python README](./python/README.md)

## Operator administration

`@langfn/admin` is LangFn's optional Super Console capability. Applications must
inject a durable `LangFnOperatorStore`, a scope-aware adapter over their real
trace storage, and a real `LangFn` client resolver. The package never creates a
default model client or silently selects credentials.

Profiles, prompts, and traces are isolated by installation, workspace, project,
and optional environment. Prompt runs require recent-auth confirmation, return
usage/trace metadata rather than model content, and project through the same
typed SDK, REST/OpenAPI, and MCP surfaces as Console.
