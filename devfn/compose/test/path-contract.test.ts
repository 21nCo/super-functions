import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { createScopedPathInterpolator, readComposeEnvDefinitions, simpleInterpolation } from "../src/path-interpolation.js";
import { createComposeEnvironment, fingerprintComposeSource, selectedComposeEndpointReferences } from "../src/index.js";

async function withDotenv(content: string, check: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "devfn-path-contract-"));
  try {
    await writeFile(path.join(root, ".env"), content);
    await check(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

it("uses the declaration that supplied a selected path, before later reassignment", async () => {
  await withDotenv("DIR=service\nFILE_PATH=${DIR}.env\nDIR=${HOME}\n", async (root) => {
    const interpolate = createScopedPathInterpolator({ HOME: "/private" }, Date.now() + 5_000, new Set(["HOME"]));
    expect(await interpolate(["${FILE_PATH}"], root)).toEqual(["service.env"]);
  });
});

it("ignores an overwritten missing declaration before the selected path", async () => {
  await withDotenv("DIR=${MISSING}\nDIR=service\nFILE_PATH=${DIR}.env\n", async (root) => {
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${FILE_PATH}"], root)).resolves.toEqual(["service.env"]);
  });
});

it("ignores an overwritten path alias that no longer supplies the selected file", async () => {
  await withDotenv("C=x\nFILE_PATH=${C}/a.env\nFILE_PATH=b.env\n", async (root) => {
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${FILE_PATH}"], root)).resolves.toEqual(["b.env"]);
  });
});

it("rejects inherited input captured before a later safe reassignment", async () => {
  await withDotenv("DIR=${HOME}\nFILE_PATH=${DIR}.env\nDIR=service\n", async (root) => {
    const interpolate = createScopedPathInterpolator({ HOME: "/private" }, Date.now() + 5_000, new Set(["HOME"]));
    await expect(interpolate(["${FILE_PATH}"], root)).rejects.toThrow(/undeclared host or secret/);
  });
});

it("reads Compose whitespace in dotenv declarations", async () => {
  await withDotenv("\u00a0FILE_PATH=service.env\n", async (root) => {
    expect((await readComposeEnvDefinitions(path.join(root, ".env"))).get("FILE_PATH")).toBe("service.env");
  });
});

it("parses long multiline dotenv values in bounded time", async () => {
  const content = `MULTI="${Array.from({ length: 20_000 }, () => "line").join("\n")}"\n`;
  await withDotenv(content, async (root) => {
    const started = Date.now();
    expect((await readComposeEnvDefinitions(path.join(root, ".env"))).get("MULTI")).toBe(content.trimEnd().slice("MULTI=".length));
    expect(Date.now() - started).toBeLessThan(1_000);
  });
}, 5_000);

it("keeps escaped quote characters as data after dotenv decoding", () => {
  expect(simpleInterpolation('"\\"one\\""', {})).toBe('"one"');
  expect(simpleInterpolation("'It\\'s ${HOME}'", {})).toBe("It's ${HOME}");
  expect(simpleInterpolation("one", {})).toBe("one");
});

it("bounds acyclic dotenv expansion before materialization", async () => {
  const chain = ["A0=a"];
  for (let index = 1; index <= 22; index += 1) {
    const reference = `\${A${index - 1}}`;
    chain.push(`A${index}=${reference}${reference}`);
  }
  await withDotenv(chain.join("\n"), async (root) => {
    const started = Date.now();
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${A22}"], root)).rejects.toThrow(/value limit|aggregate byte limit/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

it("rejects a direct credential reference before resolving a source path", async () => {
  const interpolate = createScopedPathInterpolator({ API_TOKEN: "private.env" }, Date.now() + 5_000, new Set());
  await expect(interpolate(["${API_TOKEN}"], process.cwd())).rejects.toThrow(/secret value/);
});

it("follows the selected ancestor alias in a child source path", async () => {
  await withDotenv("ALIAS=service\nDIR=${ALIAS}\n", async (root) => {
    const child = path.join(root, "child");
    await mkdir(child);
    await writeFile(path.join(child, ".env"), "FILE_PATH=${DIR}.env\n");
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${FILE_PATH}"], child, [], [
      { directory: root, envFiles: [] }, { directory: child, envFiles: [] },
    ])).resolves.toEqual(["service.env"]);
  });
});

it("allows a large unrelated dotenv value while bounding selected paths", async () => {
  await withDotenv(`UNRELATED=${"x".repeat(70_000)}\nFILE_PATH=service.env\n`, async (root) => {
    expect((await readComposeEnvDefinitions(path.join(root, ".env"))).get("FILE_PATH")).toBe("service.env");
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${FILE_PATH}"], root)).resolves.toEqual(["service.env"]);
  });
});

it("bounds selected reference count without rejecting an ordinary 129-variable path", async () => {
  const declarations = Array.from({ length: 129 }, (_, index) => `V${index}=x`).join("\n");
  await withDotenv(declarations, async (root) => {
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    const ordinary = Array.from({ length: 129 }, (_, index) => `\${V${index}}`).join("/");
    await expect(interpolate([ordinary], root)).resolves.toEqual([Array(129).fill("x").join("/")]);
    const manyMissing = Array.from({ length: 5000 }, (_, index) => `\${M${index}}`).join("/");
    const started = Date.now();
    await expect(interpolate([manyMissing], root)).rejects.toThrow(/reference count limit/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

it("rejects thousands of distinct selected Compose names before rendering a service", async () => {
  await withDotenv("", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    const references = Array.from({ length: 5000 }, (_, index) => `\${M${index}}`).join("");
    await writeFile(path.join(root, "compose.yaml"), `services:\n  api:\n    image: busybox\n    command: '${references}'\n`);
    await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec)))
      .rejects.toThrow(/reference count limit/);
  });
});

it("does not charge references in an inactive Compose fallback branch", async () => {
  await withDotenv("SET=yes\n", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    const inactive = Array.from({ length: 5000 }, (_, index) => `\${M${index}}`).join("");
    await writeFile(path.join(root, "compose.yaml"),
      `services:\n  api:\n    image: busybox\n    command: 'echo \${SET:-${inactive}}'\n`);
    await expect(selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)))
      .resolves.toEqual(new Set());
    await writeFile(path.join(root, ".env"), "SET=\n");
    await expect(selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)))
      .rejects.toThrow(/Unable to inspect selected Compose endpoint references/);
  });
});

it("checks generated URLs only when their value reaches the selected Compose branch", async () => {
  await withDotenv("", async (root) => {
    const source = path.join(root, "compose.yaml");
    const spec = { adapter: "compose" as const, service: "api" };
    const environment = { DEVFN_URL_WEB: "http://web:8080" };
    await writeFile(source, "services:\n  api:\n    image: busybox\n    command: '${DEVFN_URL_WEB:+fallback}'\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set());
    await writeFile(source, "services:\n  api:\n    image: busybox\n    command: '${DEVFN_URL_WEB}'\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set(["DEVFN_URL_WEB"]));
    await writeFile(source, "services:\n  api:\n    image: busybox\n    command: '${ACTIVATE:+${DEVFN_URL_WEB}}'\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set());
    await writeFile(path.join(root, ".env"), "ACTIVATE=yes\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set(["DEVFN_URL_WEB"]));
  });
});

it("selects a generated URL when an escaped quoted dotenv condition is nonempty", async () => {
  await withDotenv('ACTIVATE="\\"\\""\n', async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    command: '${ACTIVATE:+${DEVFN_URL_WEB}}'\n");
    const environment = createComposeEnvironment(spec, { DEVFN_URL_WEB: "http://web:8080" });
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set(["DEVFN_URL_WEB"]));
  });
});

it("rejects a transitive inherited host reference in selected dotenv input", async () => {
  await withDotenv("ALIAS=${HOME}\n", async (root) => {
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    command: '${ALIAS}'\n");
    const spec = { adapter: "compose" as const, service: "api" };
    await expect(selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)))
      .rejects.toThrow(/Unable to inspect selected Compose endpoint references/);
    const declared = { ...spec, envAllowlist: ["HOME"] };
    await expect(selectedComposeEndpointReferences(declared, root, createComposeEnvironment(declared)))
      .resolves.toEqual(new Set());
  });
});

it("keeps inherited host provenance captured before an active alias is reassigned", async () => {
  await withDotenv("A=${HOME}\nB=${A}\nA=safe\nC=${A}\n", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    command: '${B}${C}'\n");
    const supplied = { ...createComposeEnvironment(spec), HOME: "/private" };
    await expect(selectedComposeEndpointReferences(spec, root, supplied))
      .rejects.toThrow(/Unable to inspect selected Compose endpoint references/);
    const declared = { ...spec, envAllowlist: ["HOME"] };
    await expect(selectedComposeEndpointReferences(declared, root,
      { ...createComposeEnvironment(declared), HOME: "/private" }))
      .resolves.toEqual(new Set());
  });
});

it("keeps inherited host provenance through a self-referential reassignment", async () => {
  await withDotenv("A=${HOME}\nA=${A}\n", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    command: '${A}'\n");
    await expect(selectedComposeEndpointReferences(spec, root,
      { ...createComposeEnvironment(spec), HOME: "/private" }))
      .rejects.toThrow(/Unable to inspect selected Compose endpoint references/);
  });
});

it("discovers a project alias selected by an ordered service env_file condition", async () => {
  await withDotenv("ALIAS=${DEVFN_URL_API}\n", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    env_file: service.env\n");
    const envFile = path.join(root, "service.env");
    const environment = createComposeEnvironment(spec, { DEVFN_URL_API: "http://127.0.0.1:4101" });
    await writeFile(envFile, "ACTIVATE=yes\nUPSTREAM=${ACTIVATE:+${ALIAS}}\n");
    await expect(selectedComposeEndpointReferences(spec, root, environment))
      .resolves.toEqual(new Set(["DEVFN_URL_API"]));
    await writeFile(envFile, "ACTIVATE=\nUPSTREAM=${ACTIVATE:+${ALIAS}}\n");
    await expect(selectedComposeEndpointReferences(spec, root, environment)).resolves.toEqual(new Set());
    await writeFile(envFile, "ACTIVATE=yes\nCHAIN=${ALIAS}\nUPSTREAM=${ACTIVATE:+${CHAIN}}\n");
    await expect(selectedComposeEndpointReferences(spec, root, environment))
      .resolves.toEqual(new Set(["DEVFN_URL_API"]));
  });
});

it("uses ordered env_file assignments when selecting a generated URL branch", async () => {
  await withDotenv("", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    const source = path.join(root, "compose.yaml");
    const envFile = path.join(root, "service.env");
    await writeFile(source, "services:\n  api:\n    image: busybox\n    env_file: service.env\n");
    await writeFile(envFile, "SWITCH=yes\nUPSTREAM=${SWITCH:+${DEVFN_URL_WEB}}\n");
    const environment = createComposeEnvironment(spec, { DEVFN_URL_WEB: "http://web:8080" });
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set(["DEVFN_URL_WEB"]));
    await writeFile(envFile, "SWITCH=\nUPSTREAM=${SWITCH:+${DEVFN_URL_WEB}}\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set());
  });
});

it("ignores an env_file URL reference replaced by a literal service value", async () => {
  await withDotenv("", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    env_file: service.env\n    environment:\n      UPSTREAM: fixed\n");
    await writeFile(path.join(root, "service.env"), "UPSTREAM=${DEVFN_URL_WEB}\n");
    const environment = createComposeEnvironment(spec, { DEVFN_URL_WEB: "http://web:8080" });
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set());
  });
});

it("gives project dotenv values precedence over service env_file interpolation context", async () => {
  await withDotenv("ACTIVATE=yes\n", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    const envFile = path.join(root, "service.env");
    await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: service.env\n");
    const environment = createComposeEnvironment(spec, { DEVFN_URL_WEB: "http://web:8080" });
    await writeFile(envFile, "ACTIVATE=\nUPSTREAM=${ACTIVATE:+${DEVFN_URL_WEB}}\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set(["DEVFN_URL_WEB"]));
    await writeFile(path.join(root, ".env"), "ACTIVATE=\n");
    await writeFile(envFile, "ACTIVATE=yes\nUPSTREAM=${ACTIVATE:+${DEVFN_URL_WEB}}\n");
    expect(await selectedComposeEndpointReferences(spec, root, environment)).toEqual(new Set());
  });
});

it("treats an unset dotenv interpolation as a declared empty value during preflight", async () => {
  await withDotenv("X=${UNSET}\n", async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"),
      "services:\n  api:\n    image: busybox\n    command: '${X+${HOME}}'\n");
    await expect(selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)))
      .rejects.toThrow(/Unable to inspect selected Compose endpoint references/);
  });
});

it("bounds cumulative selected dotenv expansion before Compose preflight", async () => {
  const seed = "x".repeat(1024 * 1024);
  await withDotenv(`A0=${seed}\nA1=${"${A0}${A0}"}\nA2=${"${A1}${A1}"}\nA3=${"${A2}${A2}"}\nMODE=okay\n`, async (root) => {
    const spec = { adapter: "compose" as const, service: "api" };
    await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: '${A3}'\n");
    const started = Date.now();
    await expect(selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec)))
      .rejects.toThrow(/Unable to inspect selected Compose endpoint references/);
    expect(Date.now() - started).toBeLessThan(3_000);
    await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: '${MODE}'\n");
    await expect(selectedComposeEndpointReferences(spec, root, createComposeEnvironment(spec))).resolves.toEqual(new Set());
  });
});

it("bounds materialized preview aliases before exhausting a small Node heap", () => {
  const fixture = fileURLToPath(new URL("./preview-budget.fixture.mts", import.meta.url));
  const result = spawnSync(process.execPath,
    ["--max-old-space-size=128", "--import", "tsx", fixture],
    { encoding: "utf8", timeout: 5_000, maxBuffer: 1024 * 1024 });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toBe("bounded\n");
}, 10_000);

it.each([
  ["missing", "FILE_PATH=${MISSING}.env\n"],
  ["cyclic", "FILE_PATH=${ALIAS}.env\nALIAS=${FILE_PATH}\n"],
])("rejects a %s reference in the selected source path", async (_name, declarations) => {
  await withDotenv(declarations, async (root) => {
    const interpolate = createScopedPathInterpolator({}, Date.now() + 5_000, new Set());
    await expect(interpolate(["${FILE_PATH}"], root)).rejects.toThrow(/missing selected reference/);
  });
});
