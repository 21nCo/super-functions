import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  interpolateVariables,
  loadDotEnvFile,
  resolveVariableContext,
} from "../src/variables.js";

describe("variable interpolation", () => {
  it("TV-ENV-002: interpolates variables in templates and warns unresolved", () => {
    const context = {
      baseUrl: "http://localhost:3000",
      apiVersion: "v1",
    };

    const resolved = interpolateVariables("{{baseUrl}}/{{apiVersion}}/users", context);
    expect(resolved.value).toBe("http://localhost:3000/v1/users");

    const unresolved = interpolateVariables("{{baseUrl}}/{{missing}}", context);
    expect(unresolved.value).toBe("http://localhost:3000/{{missing}}");
    expect(unresolved.warnings).toEqual(["Unresolved variable: missing"]);
  });

  it("TV-ENV-003: resolves process.env secrets and errors for missing vars", () => {
    const resolved = interpolateVariables(
      "Bearer {{process.env.API_KEY}}",
      {},
      {
        processEnv: { API_KEY: "sk-test-123" },
      }
    );

    expect(resolved.value).toBe("Bearer sk-test-123");

    expect(() =>
      interpolateVariables("{{process.env.MISSING_VAR}}", {}, { processEnv: {} })
    ).toThrow(/Environment variable MISSING_VAR is not set/);
  });

  it("TV-ENV-004: applies precedence overrides > env > collection without implicit process.env seeding", () => {
    const context = resolveVariableContext({
      overrides: { baseUrl: "http://override:3000" },
      environment: { baseUrl: "http://env:3000", apiKey: "env-key" },
      collection: { apiKey: "coll-key", timeout: "5000" },
      processEnv: { baseUrl: "http://proc:3000", timeout: "1000" },
    });

    expect(context.baseUrl).toBe("http://override:3000");
    expect(context.apiKey).toBe("env-key");
    expect(context.timeout).toBe("5000");
    expect(context).not.toHaveProperty("baseUrl", "http://proc:3000");
  });

  it("ENV-003: supports loading .env file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "apifn-dotenv-"));
    const envPath = path.join(dir, ".env");
    await writeFile(envPath, "API_KEY=dotenv-secret\nBASE_URL=http://dotenv.local\n", "utf8");

    const parsed = loadDotEnvFile(envPath);
    expect(parsed).toEqual({
      API_KEY: "dotenv-secret",
      BASE_URL: "http://dotenv.local",
    });
  });
});
