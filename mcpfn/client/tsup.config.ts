import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // NOTE: The MCP SDK is intentionally kept external here. @mcpfn/client
  // re-exports the stdio client transport, which eagerly pulls in `cross-spawn`
  // (a dynamic `require("child_process")`). Inlining that transport is both
  // invalid in an ESM bundle under Node and unusable under workerd, so this
  // package stays Node-targeted. Edge/Worker consumers use @mcpfn/core (and
  // @mcpfn/auth), which are self-contained. See mcpfn/ADR-0001-COMPATIBILITY.md.
});
