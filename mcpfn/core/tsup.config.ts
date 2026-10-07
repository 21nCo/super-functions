import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // Inline the MCP SDK and its Zod runtime so consumer bundles (notably
  // Cloudflare Workers) never resolve `zod/v4` as a separate entry point.
  // A mixed `zod` (consumer root) + `zod/v4` (SDK) graph lets esbuild emit an
  // initialization order that throws `Class2 is not a constructor` at workerd
  // startup; a self-contained bundle removes that hazard without any
  // consumer-local alias. See mcpfn/ADR-0001-COMPATIBILITY.md.
  noExternal: ["@modelcontextprotocol/sdk", "zod"],
});
