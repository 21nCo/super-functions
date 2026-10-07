export default {
  entry: {
    index: "src/index.ts",
    "models/index": "src/models/index.ts",
    "prompts/index": "src/prompts/index.ts",
    "tools/index": "src/tools/index.ts",
    "orchestration/index": "src/orchestration/index.ts",
    "graph/index": "src/graph/index.ts",
    "agents/index": "src/agents/index.ts",
    "observability/index": "src/observability/index.ts",
    "http/index": "src/http/index.ts",
    "structured/index": "src/structured/index.ts",
    "rag/index": "src/rag/index.ts",
    "memory/index": "src/memory/index.ts",
    "evaluation/index": "src/evaluation/index.ts",
    "mcp/index": "src/mcp/index.ts",
    "utils/index": "src/utils/index.ts"
  },
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    "@mcpfn/core",
    "@modelcontextprotocol/sdk",
    "@superfunctions/auth",
    "@superfunctions/db",
    "@superfunctions/http",
    "zod",
    "zod-to-json-schema"
  ]
};
