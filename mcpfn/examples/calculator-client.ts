import { createMcpFnClient, streamableHttpTarget } from "@mcpfn/client";

const url = process.argv[2] ?? "http://127.0.0.1:3000/mcp";
const client = createMcpFnClient({ target: streamableHttpTarget(url) });

await client.connect();
try {
  const tools = await client.tools.listAll();
  const result = await client.tools.call("calculator_sum", { left: 2, right: 3 });
  process.stdout.write(`${JSON.stringify({ tools, result }, null, 2)}\n`);
} finally {
  await client.close();
}
