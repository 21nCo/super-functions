# McpFn CLI

The `mcpfn` CLI provides stable CI exit behavior:

```sh
mcpfn manifest ./mcp-server.ts --output mcpfn.manifest.json
mcpfn validate mcpfn.manifest.json
mcpfn diff main.manifest.json mcpfn.manifest.json --fail-on-behavioral
mcpfn test ./mcp-server.ts ./mcp-scenarios.ts --output mcpfn-report.json --junit mcpfn-report.xml
mcpfn test-target https://api.example.com/mcp ./mcp-scenarios.ts
mcpfn test-target http://127.0.0.1:3000/mcp ./mcp-scenarios.ts \
  --header "Authorization: Bearer $MCP_API_KEY" \
  --output target-report.json --junit target-report.xml
mcpfn inspect https://api.example.com/mcp --output inspection.json
mcpfn inspect http://127.0.0.1:3000/mcp --header "Authorization: Bearer $MCP_API_KEY"
mcpfn inspect node --stdio --args '["./dist/server.js"]'
mcpfn auth-diagnose https://api.example.com/mcp
mcpfn conformance http://127.0.0.1:3000/mcp --suite active
mcpfn conformance http://127.0.0.1:3000/mcp --suite active \
  --header "Authorization: Bearer $MCP_API_KEY"
```

- `0`: valid, compatible, or all scenarios passed;
- `1`: breaking/selected behavioral change, test failure, or official conformance failure;
- `2`: invalid configuration, source, or command usage.

`inspect` and `test-target` use the production `@mcpfn/client` session engine;
HTTP is the default and `--stdio` treats the target as an executable. Repeatable
`--header "Name: value"` options inject credentials into HTTP targets without
constructing `McpFnServer` or `McpFnRegistry`. `--header` cannot be combined
with `--stdio`. `--junit` writes a redacted JUnit document that names the
failing scenario and protocol layer. `auth-diagnose` probes protected-resource
and authorization-server discovery without opening a browser or exchanging
credentials. Reports and inspector timelines are redacted, versioned, and
aggregate-size bounded. Target open, authorization, and execution failures use
exit `1`; malformed command or file configuration uses exit `2`.
`mcpfn test --max-report-bytes` can tighten the default one-MiB scenario report
cap.

The conformance command delegates to the pinned official
`@modelcontextprotocol/conformance` package (`OFFICIAL_CONFORMANCE_VERSION`,
currently `0.1.16`). Authenticated loopback targets use the same `--header`
flag; McpFn binds a temporary loopback-only proxy that injects those headers.
The command requires Node.js 22 or newer; the other CLI commands support
Node.js 18.18 or newer. McpFn does not maintain a competing protocol test suite.

A non-McpFn official-SDK example lives at
`mcpfn/examples/external-http-server.ts` and is exercised by
`scripts/test-mcpfn-external-server.mjs` during `npm run gate:mcpfn-release`.

The manifest source may be JSON, a default-exported `McpFnServer`, an async factory returning a server, or a `McpFnRegistry`. Registry sources require both `--name` and `--version`. The `test` command requires a server export because it exercises a real client/server connection.

Scenario modules default-export either an array of `McpFnScenario` values or a
version 1 `mcpfn.scenarios` artifact. See the runnable [server](https://github.com/21nCo/super-functions/blob/main/mcpfn/examples/calculator-server.ts), [scenarios](https://github.com/21nCo/super-functions/blob/main/mcpfn/examples/calculator-scenarios.ts), and committed [manifest](https://github.com/21nCo/super-functions/blob/main/mcpfn/examples/calculator.manifest.json).
