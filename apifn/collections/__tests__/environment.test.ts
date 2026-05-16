import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readCollection } from "../src/reader.js";
import {
  readEnvironmentFile,
  readEnvironments,
  selectEnvironment,
  writeEnvironmentFile,
} from "../src/environment.js";

describe("environment file handling", () => {
  it("TV-ENV-001: reads and writes environment file in OpenCollection format", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "apifn-env-"));
    const filePath = path.join(dir, "development.yml");

    await writeEnvironmentFile(filePath, {
      name: "development",
      variables: {
        baseUrl: "http://localhost:3000",
      },
    });

    const parsed = await readEnvironmentFile(filePath);
    expect(parsed).toEqual({
      name: "development",
      variables: {
        baseUrl: "http://localhost:3000",
      },
    });
  });

  it("TV-ENV-005: supports multiple environments and discovery", async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), "apifn-env-coll-"));
    await writeFile(
      path.join(fixture, "opencollection.yml"),
      "name: Env Collection\n",
      "utf8"
    );

    const usersDir = path.join(fixture, "users");
    await mkdir(usersDir, { recursive: true });
    await writeFile(
      path.join(usersDir, "list-users.yml"),
      [
        "info:",
        "  name: List Users",
        "  type: http",
        "http:",
        "  method: GET",
        "  url: '{{baseUrl}}/users'",
        "",
      ].join("\n"),
      "utf8"
    );

    const envDir = path.join(fixture, "environments");
    await mkdir(envDir, { recursive: true });

    await writeEnvironmentFile(path.join(envDir, "development.yml"), {
      name: "development",
      variables: { baseUrl: "http://localhost:3000" },
    });

    await writeEnvironmentFile(path.join(envDir, "staging.yml"), {
      name: "staging",
      variables: { baseUrl: "https://staging.example.com" },
    });

    await writeEnvironmentFile(path.join(envDir, "production.yml"), {
      name: "production",
      variables: { baseUrl: "https://api.example.com" },
    });

    const envs = await readEnvironments(envDir);
    expect(Object.keys(envs).sort()).toEqual(["development", "production", "staging"]);

    const collection = await readCollection(fixture);
    expect(collection.environments.staging?.variables.baseUrl).toBe(
      "https://staging.example.com"
    );
    expect(selectEnvironment(collection.environments, "production").variables.baseUrl).toBe(
      "https://api.example.com"
    );
  });

  it("rejects array variables and duplicate environment keys", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "apifn-env-"));
    await writeFile(
      path.join(dir, "bad.yml"),
      ["name: bad", "variables:", "  - nope", ""].join("\n"),
      "utf8"
    );

    await expect(readEnvironmentFile(path.join(dir, "bad.yml"))).rejects.toThrow(
      /Environment variables are required/
    );

    const envDir = await mkdtemp(path.join(tmpdir(), "apifn-env-dupe-"));
    await writeFile(path.join(envDir, "dev.yml"), "name: dev\nvariables: {}\n", "utf8");
    await writeFile(path.join(envDir, "dev.yaml"), "name: dev2\nvariables: {}\n", "utf8");

    await expect(readEnvironments(envDir)).rejects.toThrow(/Duplicate environment key 'dev'/);
  });
});
