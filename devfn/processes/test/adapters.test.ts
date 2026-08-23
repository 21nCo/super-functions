import { describe, expect, it } from "vitest";
import { createProcessEnvironment, createStreamingRedactor, resolveAdapterCommand } from "../src/index.js";

describe("runtime adapters", () => {
  it("preserves pinned package-manager semantics", () => {
    expect(resolveAdapterCommand({ adapter: "pnpm", script: "dev", command: ["--host", "127.0.0.1"] })).toEqual(["corepack", "pnpm", "run", "dev", "--host", "127.0.0.1"]);
    expect(resolveAdapterCommand({ adapter: "wrangler" })).toEqual(["npm", "exec", "--offline", "--", "wrangler", "dev"]);
  });

  it("inherits only base and allowlisted environment values", () => {
    const env = createProcessEnvironment({ adapter: "command", command: ["node"], envAllowlist: ["ALLOWED"], env: { PORT: "configured" } }, { PORT: "4100" }, { PATH: "/bin", ALLOWED: "yes", SECRET_TOKEN: "no" });
    expect(env).toMatchObject({ PATH: "/bin", ALLOWED: "yes", PORT: "4100" });
    expect(env.SECRET_TOKEN).toBeUndefined();
  });

  it("disables Corepack network access for pnpm startup", () => {
    expect(createProcessEnvironment({ adapter: "pnpm", script: "dev" }, {}, { PATH: "/bin" }).COREPACK_ENABLE_NETWORK).toBe("0");
  });

  it("redacts secrets even when output chunks split the value", () => {
    let output = "";
    const redactor = createStreamingRedactor(["devfn-test-secret"], (value) => { output += value; });
    redactor.push("before devfn-");
    redactor.push("test-secret after");
    redactor.end();
    expect(output).toBe("before [REDACTED] after");
  });
});
