import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { checkReadinessNow, gatedLauncherStatus, processBirthSignature, runGatedCommand } from "@devfn/processes";
import { describe, expect, it } from "vitest";
import { ComposeController, composeProjectName, type ComposeLaunch, createComposeEnvironment, createComposeReadinessEnvironment, effectiveComposeServiceNetworks, fingerprintComposeSource, renderComposeOverride, type ManagedComposeService } from "../src/index.js";
import { assertComposeSourceGraphBounded } from "../src/source-files.js";

const execFileAsync = promisify(execFile);
const MOCK_COMPOSE_HASH = "a".repeat(64);
// No such process or group exists, so it never signals anything real.
const ABSENT_LAUNCHER = { pid: 2_147_483_646 };

/** A controller whose docker compose up goes through the stub, as if its gated launcher was recorded first. */
async function readBirthSignature(pid: number): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const signature = await processBirthSignature(pid);
    if (signature) return signature;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No birth signature for ${pid}.`);
}

/** Poll a launcher's status until it satisfies the predicate, failing after a bounded wait. */
async function waitForLauncherStatus(launcher: { pid: number; birthSignature?: string }, done: (status: string) => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (done(await gatedLauncherStatus(launcher))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Launcher ${launcher.pid} did not reach the expected status.`);
}

function stubbed(run: NonNullable<ConstructorParameters<typeof ComposeController>[0]>): ComposeController {
  return new ComposeController(run, async (file, args, options) => {
    await options.onLaunched(ABSENT_LAUNCHER);
    return await run(file, args, options) as { stdout: string; stderr: string };
  }, 0);
}

/**
 * Start a gated launch from a CLI process that dies once the launch runs, as
 * an interrupted devfn up would. The launched command keeps a child standing
 * in for the Compose plugin that can still create containers.
 */
async function launchFromDyingCli(): Promise<{ pid: number; birthSignature?: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-dying-cli-"));
  try {
    const launcherFile = path.join(dir, "launcher.json");
    const command = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); setTimeout(() => {}, 60000);";
    await writeFile(path.join(dir, "cli.mjs"), `import { runGatedCommand } from ${JSON.stringify(new URL("../../processes/dist/index.js", import.meta.url).href)};
import { writeFileSync } from "node:fs";
await runGatedCommand(process.execPath, ["-e", ${JSON.stringify(command)}], { onLaunched: async (launcher) => {
  writeFileSync(${JSON.stringify(launcherFile)}, JSON.stringify(launcher));
  setTimeout(() => process.exit(9), 300);
} });
`);
    const exit = await new Promise<number | null>((resolve) => spawn(process.execPath, [path.join(dir, "cli.mjs")], { stdio: "ignore" }).once("exit", resolve));
    if (exit !== 9) throw new Error(`The launching CLI exited with ${exit}.`);
    return JSON.parse(await readFile(launcherFile, "utf8")) as { pid: number; birthSignature?: string };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("ComposeController", () => {
  it("merges unique Compose resources by effective target across short and long forms", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-unique-resources-"));
    try {
      await writeFile(path.join(root, "base.yaml"), `services:
  base:
    image: busybox
    volumes: ['\${HOME:-./parent}:/data', './keep:/keep']
    configs: [first, keep]
    devices: ['/dev/one:/dev/fixture:rwm', '/dev/keep:/dev/keep']
    ports:
      - {target: 80, published: '8080', host_ip: 127.0.0.1, protocol: tcp, x-marker: old}
`);
      const source = path.join(root, "compose.yaml");
      await writeFile(source, `services:
  api:
    extends: {file: base.yaml, service: base}
    volumes: ['./safe:/data']
    configs: [{source: second, target: /first}]
    devices: ['/dev/two:/dev/fixture:rwm']
    ports:
      - {target: 80, published: '8080', host_ip: 127.0.0.1, protocol: tcp, x-marker: new}
`);
      const service = (await assertComposeSourceGraphBounded(source, "api", async (names) => names)).service;
      expect(service?.volumes).toEqual(["./safe:/data", "./keep:/keep"]);
      expect(service?.configs).toEqual([{ source: "second", target: "/first" }, "keep"]);
      expect(service?.devices).toEqual(["/dev/two:/dev/fixture:rwm", "/dev/keep:/dev/keep"]);
      expect(service?.ports).toEqual([{ target: 80, published: "8080", host_ip: "127.0.0.1", protocol: "tcp", "x-marker": "new" }]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("retains inherited unique mounts in bounded source inventory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-inherited-mounts-"));
    try {
      await writeFile(path.join(root, "base.yaml"), "services:\n  base:\n    image: busybox\n    volumes: ['${HOME}:/data', './logs:/logs']\n");
      const source = path.join(root, "compose.yaml");
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    volumes: ['./safe:/extra', './other:/logs']\n");
      const inventory = await assertComposeSourceGraphBounded(source, "api", async (names) => names);
      expect(inventory.service?.volumes).toEqual(["${HOME}:/data", "./other:/logs", "./safe:/extra"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("bounds expanded extends ancestors without Docker", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-expanded-"));
    const source = path.join(root, "compose.yaml");
    const services = ["  api:\n    extends: step0"];
    for (let index = 0; index < 490; index += 1) {
      services.push(`  step${index}:\n    ${index === 489 ? "image: busybox" : `extends: step${index + 1}`}\n    environment:\n      KEY_${index}: ${"x".repeat(256)}`);
    }
    try {
      await writeFile(source, `services:\n${services.join("\n")}\n`);
      await expect(assertComposeSourceGraphBounded(source, "api", async (names) => names))
        .rejects.toThrow(/materialization limit/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 10_000);

  it("bounds aggregate Compose source bytes before Docker config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-source-limit-"));
    const spec = { adapter: "compose" as const, service: "api" };
    try {
      const padding = `#${"x".repeat(6 * 1024 * 1024)}\n`;
      await mkdir(path.join(root, "nested"));
      await writeFile(path.join(root, "compose.yaml"), `${padding}include: [nested/child.yaml]\nservices:\n  api:\n    image: busybox\n`);
      await writeFile(path.join(root, "nested", "child.yaml"), `${padding}services:\n  child:\n    image: busybox\n`);
      await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).rejects.toThrow(/inventory Compose sources/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 20_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("reads effective default, explicit and isolated service networks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-networks-"));
    const file = path.join(root, "compose.yaml");
    const read = (service: string) => effectiveComposeServiceNetworks({ adapter: "compose", service }, root, "opaque/owner", createComposeEnvironment({ adapter: "compose", service }));
    try {
      await writeFile(file, "services:\n  web:\n    image: busybox\n  consumer:\n    image: busybox\n");
      expect(await read("web")).toEqual(await read("consumer"));
      await writeFile(file, "services:\n  web:\n    image: busybox\n    networks: [blue]\n  consumer:\n    image: busybox\n    networks: [green]\nnetworks:\n  blue: {}\n  green: {}\n");
      const isolatedConsumer = await read("consumer");
      expect((await read("web")).some((network) => isolatedConsumer.includes(network))).toBe(false);
      await writeFile(file, "services:\n  web:\n    image: busybox\n    networks: [shared]\n  consumer:\n    image: busybox\n    networks: [shared]\nnetworks:\n  shared:\n    external: true\n    name: fixture-external-network\n");
      expect(await read("web")).toEqual(["fixture-external-network"]);
      expect(await read("consumer")).toEqual(["fixture-external-network"]);
      await writeFile(file, "services:\n  web:\n    image: busybox\n    network_mode: host\n");
      expect(await read("web")).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("fingerprints effective Compose command and env_file inputs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-fingerprint-"));
    const file = path.join(root, "compose.yaml");
    const envFile = path.join(root, "service.env");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await writeFile(envFile, "MODE=first\n");
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    command: ["sleep", "10"]\n    env_file: service.env\n');
      const first = await fingerprint();
      expect(await fingerprint()).toBe(first);
      await writeFile(envFile, "MODE=second\n");
      const changedEnvironment = await fingerprint();
      expect(changedEnvironment).not.toBe(first);
      await writeFile(envFile, "MODE=first\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(envFile, "MODE=second\n");
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    command: ["sleep", "20"]\n    env_file: service.env\n');
      expect(await fingerprint()).not.toBe(changedEnvironment);
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    command: ["sleep", "20"]\n    environment:\n      MODE: current\n    env_file: service.env\n');
      const currentLiteral = await fingerprint();
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    command: ["sleep", "20"]\n    environment:\n      MODE: changed\n    env_file: service.env\n');
      expect(await fingerprint()).not.toBe(currentLiteral);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("tracks effective interpolation and selected resources without secret values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-resources-"));
    const source = path.join(root, "compose.yaml");
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["MODE", "CUSTOM"], secretEnv: ["CUSTOM"] };
    const fingerprint = (mode: string, token: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, MODE: mode, CUSTOM: token }));
    const document = (volume: string, unused = "other") => `services:\n  api:\n    image: busybox\n    environment:\n      MODE: \${MODE}\n      CUSTOM: \${CUSTOM}\n    volumes: [data:/var/data]\nvolumes:\n  data:\n    name: ${volume}\n  unused:\n    name: ${unused}\n`;
    try {
      await writeFile(source, document("first"));
      const first = await fingerprint("one", "synthetic-one");
      expect(await fingerprint("two", "synthetic-one")).not.toBe(first);
      expect(await fingerprint("one", "synthetic-two")).toBe(first);
      await writeFile(source, document("second"));
      expect(await fingerprint("one", "synthetic-one")).not.toBe(first);
      await writeFile(source, document("first", "changed"));
      expect(await fingerprint("one", "synthetic-one")).toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("tracks selected network and config definitions after YAML merges", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-selected-"));
    const source = path.join(root, "compose.yaml");
    const configFile = path.join(root, "settings.txt");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    const document = (network: string, config: string, unused = "other") => `x-env: &common\n  MODE: fixture\nservices:\n  api:\n    image: busybox\n    environment:\n      <<: *common\n    networks: [internal]\n    configs: [settings]\nnetworks:\n  internal:\n    name: ${network}\n  unused:\n    name: ${unused}\nconfigs:\n  settings:\n    file: ${config}\n`;
    try {
      await writeFile(configFile, "application-neutral\n");
      await writeFile(source, document("first", "settings.txt"));
      const first = await fingerprint();
      await writeFile(configFile, "application-neutral\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(configFile, "application-changed\n");
      expect(await fingerprint()).not.toBe(first);
      await writeFile(configFile, "application-neutral\n");
      const restored = await fingerprint();
      await writeFile(source, document("second", "settings.txt"));
      expect(await fingerprint()).not.toBe(restored);
      await writeFile(path.join(root, "other.txt"), "application-neutral\n");
      await writeFile(source, document("first", "other.txt"));
      expect(await fingerprint()).not.toBe(first);
      await writeFile(source, document("first", "settings.txt", "changed"));
      expect(await fingerprint()).toBe(restored);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("accepts include path lists and same-file extends at the effective service", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-path-list-"));
    const nested = path.join(root, "nested");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await mkdir(nested);
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: [nested/first.yaml, nested/second.yaml]\n");
      await writeFile(path.join(nested, "first.yaml"), "services:\n  helper:\n    image: busybox\n");
      await writeFile(path.join(nested, "second.yaml"), "services:\n  base:\n    image: busybox\n    command: [sleep, '10']\n  api:\n    extends: base\n");
      const first = await fingerprint();
      await writeFile(path.join(nested, "second.yaml"), "services:\n  base:\n    image: busybox\n    command: [sleep, '20']\n  api:\n    extends: base\n");
      expect(await fingerprint()).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("tracks default and include-scoped interpolation files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-scoped-env-"));
    const nested = path.join(root, "nested");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await mkdir(nested);
      await writeFile(path.join(root, ".env"), "ROOT_MODE=first\n");
      await writeFile(path.join(nested, "project.env"), "CHILD_MODE=one\n");
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: nested/compose.yaml\n    env_file: nested/project.env\nservices:\n  api:\n    image: busybox\n    environment:\n      ROOT_MODE: ${ROOT_MODE}\n");
      await writeFile(path.join(nested, "compose.yaml"), "services:\n  child:\n    image: busybox\n    environment:\n      CHILD_MODE: ${CHILD_MODE}\n");
      const first = await fingerprint();
      await writeFile(path.join(root, ".env"), "ROOT_MODE=second\n");
      expect(await fingerprint()).not.toBe(first);
      await writeFile(path.join(root, ".env"), "ROOT_MODE=first\n");
      expect(await fingerprint()).toBe(first);
      const childSpec = { adapter: "compose" as const, service: "child" };
      const childFingerprint = () => fingerprintComposeSource(childSpec, root, "owner", createComposeEnvironment(childSpec));
      const childFirst = await childFingerprint();
      await writeFile(path.join(nested, "project.env"), "CHILD_MODE=two\n");
      expect(await fingerprint()).toBe(first);
      expect(await childFingerprint()).not.toBe(childFirst);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("requires explicit provenance for inherited Compose interpolation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-inherited-"));
    const source = path.join(root, "compose.yaml");
    const implicit = { adapter: "compose" as const, service: "api" };
    const explicit = { ...implicit, envAllowlist: ["HOME"] };
    const dockerConfig = process.env.DOCKER_CONFIG ?? path.join(process.env.HOME ?? "", ".docker");
    try {
      await writeFile(source, "services:\n  api:\n    image: busybox\n    environment:\n      WORK_DIR: ${HOME}\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).rejects.toThrow(/inherited host value/);
      const first = await fingerprintComposeSource(explicit, root, "owner", createComposeEnvironment(explicit, {}, { ...process.env, DOCKER_CONFIG: dockerConfig, HOME: "/tmp/first" }));
      const second = await fingerprintComposeSource(explicit, root, "owner", createComposeEnvironment(explicit, {}, { ...process.env, DOCKER_CONFIG: dockerConfig, HOME: "/tmp/second" }));
      expect(second).not.toBe(first);
      await writeFile(source, "services:\n  api:\n    image: busybox\n    command: [echo, '$$HOME']\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).resolves.toMatch(/^[a-f0-9]{64}$/);
      await writeFile(source, "services:\n  api:\n    image: busybox\n  unrelated:\n    image: busybox\n    environment:\n      WORK_DIR: ${HOME}\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).resolves.toMatch(/^[a-f0-9]{64}$/);
      await writeFile(source, "services:\n  api:\n    image: busybox\n    networks: [selected]\nnetworks:\n  selected:\n    name: ${USER}\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).rejects.toThrow(/inherited host value/);
      await writeFile(source, "include: ${HOME}/included.yaml\nservices:\n  api:\n    image: busybox\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).rejects.toThrow(/inventory Compose sources/);
      await writeFile(path.join(root, "base.yaml"), "services:\n  base:\n    image: busybox\n    environment:\n      WORK_DIR: ${HOME}\n");
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment: !override\n      WORK_DIR: fixed\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).resolves.toMatch(/^[a-f0-9]{64}$/);
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment:\n      WORK_DIR: fixed\n");
      await expect(fingerprintComposeSource(implicit, root, "owner", createComposeEnvironment(implicit))).resolves.toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("tracks nested optional env_file inputs without requiring missing files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-optional-env-"));
    const nested = path.join(root, "nested");
    await mkdir(nested);
    const file = path.join(nested, "compose.yaml");
    const envFile = path.join(nested, "service.env");
    const spec = { adapter: "compose" as const, file: "nested/compose.yaml", service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await writeFile(path.join(root, "service.env"), "MODE=unrelated\n");
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    env_file:\n      - path: service.env\n        required: false\n');
      const absent = await fingerprint();
      await writeFile(envFile, "MODE=one\n");
      const present = await fingerprint();
      expect(present).not.toBe(absent);
      await writeFile(envFile, "MODE=second\n");
      expect(await fingerprint()).not.toBe(present);
      await rm(envFile);
      expect(await fingerprint()).toBe(absent);
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    env_file: service.env\n');
      await expect(fingerprint()).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("tracks merged include and extends inputs by effective bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-imports-"));
    const nested = path.join(root, "nested");
    await mkdir(nested);
    const top = path.join(root, "compose.yaml");
    const included = path.join(nested, "included.yaml");
    const leaf = path.join(nested, "leaf.yaml");
    const base = path.join(nested, "base.yaml");
    const grand = path.join(nested, "grand.yaml");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    const sideSpec = { adapter: "compose" as const, service: "side" };
    const sideFingerprint = () => fingerprintComposeSource(sideSpec, root, "owner", createComposeEnvironment(sideSpec));
    try {
      await writeFile(top, 'include: [nested/included.yaml]\nservices:\n  api:\n    extends:\n      file: nested/base.yaml\n      service: base\n    image: busybox\n');
      await writeFile(included, 'include: [leaf.yaml]\n');
      await writeFile(leaf, 'services:\n  side:\n    image: busybox\n');
      await writeFile(base, 'services:\n  base:\n    extends:\n      file: grand.yaml\n      service: grand\n');
      await writeFile(grand, 'services:\n  grand:\n    command: ["sleep", "10"]\n');
      const original = await fingerprint();
      const originalSide = await sideFingerprint();
      await writeFile(grand, 'services:\n  grand:\n    command: ["sleep", "20"]\n');
      expect(await fingerprint()).not.toBe(original);
      await writeFile(grand, 'services:\n  grand:\n    command: ["sleep", "10"]\n');
      expect(await fingerprint()).toBe(original);
      await writeFile(leaf, 'services:\n  side:\n    image: busybox\n    command: ["sleep", "30"]\n');
      expect(await sideFingerprint()).not.toBe(originalSide);
      // An unrelated included service does not change api's startup recipe.
      expect(await fingerprint()).toBe(original);
      await writeFile(top, 'include: [nested/included.yaml]\nservices:\n  api:\n    extends:\n      file: nested/base.yaml\n      service: base\n    image: busybox\n    command: ["sleep", "40"]\n');
      expect(await fingerprint()).not.toBe(original);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("ignores environment inputs removed by Compose merge tags", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-effective-env-"));
    const base = path.join(root, "base.yaml");
    const source = path.join(root, "compose.yaml");
    const ignoredFile = path.join(root, "ignored.env");
    const activeFile = path.join(root, "active.env");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    const baseText = (value: string) => `services:\n  base:\n    image: busybox\n    environment:\n      BASE_ONLY: ${value}\n    env_file: ignored.env\n`;
    try {
      await writeFile(base, baseText("first"));
      await writeFile(ignoredFile, "MODE=ignored\n");
      await writeFile(activeFile, "MODE=active\n");
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment: !override\n      CURRENT: one\n    env_file: !override [active.env]\n");
      const original = await fingerprint();
      await writeFile(base, baseText("second"));
      await writeFile(ignoredFile, "MODE=changed\n");
      expect(await fingerprint()).toBe(original);
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment: !override\n      CURRENT: two\n    env_file: !override [active.env]\n");
      const changedLiteral = await fingerprint();
      expect(changedLiteral).not.toBe(original);
      await writeFile(activeFile, "MODE=changed\n");
      const changedFile = await fingerprint();
      expect(changedFile).not.toBe(changedLiteral);
      await rm(ignoredFile);
      expect(await fingerprint()).toBe(changedFile);
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment: !reset {}\n    env_file: !reset []\n");
      const reset = await fingerprint();
      await writeFile(base, baseText("third"));
      expect(await fingerprint()).toBe(reset);
      await writeFile(source, "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment: !reset null\n    env_file: !reset []\n");
      expect(await fingerprint()).toBe(reset);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("resolves interpolated optional env files without hashing ambient values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-interpolated-env-"));
    const file = path.join(root, "compose.yaml");
    const envFile = path.join(root, "service.env");
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["FILE_PATH", "UNRELATED_SECRET"] };
    const fingerprint = (unrelated: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, FILE_PATH: "service.env", UNRELATED_SECRET: unrelated }));
    try {
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    env_file:\n      - path: "${FILE_PATH}"\n        required: false\n');
      const absent = await fingerprint("one");
      expect(await fingerprint("two")).toBe(absent);
      await writeFile(envFile, "MODE=first\n");
      const present = await fingerprint("one");
      expect(present).not.toBe(absent);
      await writeFile(envFile, "MODE=second\n");
      expect(await fingerprint("one")).not.toBe(present);
      await rm(envFile);
      expect(await fingerprint("one")).toBe(absent);
      await writeFile(file, 'services:\n  api:\n    image: busybox\n    env_file: "${FILE_PATH}"\n');
      await expect(fingerprint("one")).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("keeps case-distinct opaque owners in separate stable Compose projects", () => {
    expect(composeProjectName("blue", "Owner")).not.toBe(composeProjectName("BLUE", "owner"));
    expect(composeProjectName("blue", "OWNER")).not.toBe(composeProjectName("blue", "owner-0559aadba9e2"));
    expect(composeProjectName("blue", "Owner")).not.toBe(composeProjectName("BLUE", "Owner"));
    expect(composeProjectName("blue", "Owner")).toBe(composeProjectName("blue", "Owner"));
    expect(composeProjectName("blue", "--token=synthetic-sentinel")).not.toContain("synthetic-sentinel");
    expect(composeProjectName("abcdefghijklmnopqrstuvwxy-one", "owner")).not.toBe(composeProjectName("abcdefghijklmnopqrstuvwxy-two", "owner"));
    expect(composeProjectName("team.alpha", "owner")).not.toBe(composeProjectName("team-alpha", "owner"));
  });

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("isolates simultaneous case-distinct owners through stop and retry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-dual-owner-"));
    const file = path.join(root, "compose.yaml");
    const controller = new ComposeController();
    const prefix = path.basename(root).toLowerCase();
    const owners = ["Owner", "owner"];
    await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n');
    const start = (owner: string) => controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: prefix }, root,
      runtimeDir: path.join(root, owner), instanceId: owner, ports: {} });
    try {
      const first = await start(owners[0]);
      const second = await start(owners[1]);
      expect(first.projectName).not.toBe(second.projectName);
      expect(first.containerIds[0]).not.toBe(second.containerIds[0]);
      await controller.stop(first);
      expect(await controller.status(second)).toBe("running");
      await controller.stop(second);
      const retried = await start(owners[0]);
      expect(retried.projectName).toBe(first.projectName);
      expect(await controller.status(retried)).toBe("running");
    } finally {
      for (const owner of owners) await execFileAsync("docker", ["compose", "-p", composeProjectName(prefix, owner), "-f", file, "down"], { cwd: root }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
  it("exposes availability as a non-throwing diagnostic", async () => {
    const available = stubbed(async () => ({ stdout: "2.24.4", stderr: "" }));
    const tooOld = stubbed(async () => ({ stdout: "Docker Compose version v2.23.99", stderr: "" }));
    const unavailable = stubbed(async () => { throw new Error("missing"); });
    expect(await available.available()).toBe(true);
    expect(await tooOld.available()).toBe(false);
    expect(await unavailable.available()).toBe(false);
  });

  it("keeps conventional container ports behind allocated loopback ports", () => {
    const output = renderComposeOverride({ adapter: "compose", service: "postgres", ports: { database: 5432 } }, { database: 55432 });
    expect(output).toContain("127.0.0.1:55432:5432");
    expect(output).toContain("ports: !override");
  });

  it("sanitizes readiness and lifecycle environments with generated values taking precedence", () => {
    expect(createComposeEnvironment(
      { adapter: "compose", service: "api", envAllowlist: ["ALLOWED"], env: { APP_PORT: "configured" } },
      { APP_PORT: "4100" },
      { PATH: "/bin", ALLOWED: "yes", SECRET_TOKEN: "no" },
    )).toMatchObject({ PATH: "/bin", ALLOWED: "yes", APP_PORT: "4100" });
    expect(createComposeEnvironment(
      { adapter: "compose", service: "api", envAllowlist: ["ALLOWED"], env: { APP_PORT: "configured" } },
      { APP_PORT: "4100" },
      { PATH: "/bin", ALLOWED: "yes", SECRET_TOKEN: "no" },
    )).not.toHaveProperty("SECRET_TOKEN");
  });

  it("delivers allowlisted secrets to host command readiness without storing them in resolved values", async () => {
    const marker = "synthetic-sentinel";
    const previous = process.env.API_TOKEN;
    process.env.API_TOKEN = marker;
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-readiness-"));
    const readinessEnvironment = { DEVFN_URL_WEB: "http://127.0.0.1:4100", MODE: "probe" };
    const spec = { adapter: "compose" as const, service: "web", envAllowlist: ["API_TOKEN"], secretEnv: ["API_TOKEN"],
      health: { type: "command" as const, command: [process.execPath, "-e", "if (!process.env.API_TOKEN || process.env.DEVFN_URL_WEB !== 'http://127.0.0.1:4100') process.exit(1)"] } };
    let psCalls = 0;
    const controller = stubbed(async (_file, args) => {
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) return { stdout: ++psCalls >= 3 ? "container-id\n" : "", stderr: "" };
      if (args[0] === "inspect") return { stdout: "true\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    try {
      const managed = await controller.start({ name: "web", spec, root, runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {},
        environment: { DEVFN_URL_WEB: "http://web:8080" }, readinessEnvironment });
      expect(JSON.stringify(managed)).not.toContain(marker);
      expect(JSON.stringify(readinessEnvironment)).not.toContain(marker);
      const statusEnvironment = createComposeReadinessEnvironment(spec, readinessEnvironment);
      expect(statusEnvironment).toMatchObject({ API_TOKEN: marker, DEVFN_URL_WEB: "http://127.0.0.1:4100" });
      expect(statusEnvironment).not.toHaveProperty("UNLISTED_SECRET");
      expect(await checkReadinessNow({ health: spec.health, ports: {}, logPath: "", cwd: root, environment: statusEnvironment, isAlive: () => true })).toBe(true);
      delete process.env.API_TOKEN;
      expect(await checkReadinessNow({ health: spec.health, ports: {}, logPath: "", cwd: root,
        environment: createComposeReadinessEnvironment(spec, readinessEnvironment), isAlive: () => true })).toBe(false);
      process.env.API_TOKEN = marker;
      expect(createComposeReadinessEnvironment({ ...spec, health: { type: "http", url: "http://127.0.0.1:4100" } }, readinessEnvironment)).not.toHaveProperty("API_TOKEN");
    } finally {
      if (previous === undefined) delete process.env.API_TOKEN;
      else process.env.API_TOKEN = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("binds explicitly public ports and disables persistence for secret-bearing logs", () => {
    const output = renderComposeOverride(
      { adapter: "compose", service: "api", ports: { api: 8080 }, secretEnv: ["API_TOKEN"], envAllowlist: ["API_TOKEN"] },
      { api: 48080 },
      { api: "0.0.0.0" },
    );
    expect(output).toContain("0.0.0.0:48080:8080");
    expect(output).toContain("driver: none");
  });

  it("renders a valid empty service override", () => {
    expect(renderComposeOverride({ adapter: "compose", service: "worker" }, {})).toContain("worker:\n    {}");
    expect(renderComposeOverride({ adapter: "compose", service: "worker" }, {}, {}, {}, { instanceId: "instance", lifecycleName: "worker" })).toContain('devfn.managed: "true"');
  });

  it("rejects a missing host allocation", () => {
    expect(() => renderComposeOverride({ adapter: "compose", service: "api", ports: { api: 8080 } }, {})).toThrow(/Missing allocation/);
  });

  it("passes the effective environment to every Compose query and lifecycle command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-"));
    const calls: Array<{ args: readonly string[]; cwd?: string; appPort?: string; dockerHost?: string }> = [];
    const controller = stubbed(async (_file, args, options) => {
      calls.push({ args, cwd: options.cwd, appPort: options.env?.APP_PORT, dockerHost: options.env?.DOCKER_HOST });
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) return { stdout: calls.filter((call) => call.args.includes("ps")).length === 3 ? "container-id\n" : "", stderr: "" };
      if (args[0] === "inspect") return { stdout: "true\n", stderr: "" };
      if (args[0] === "logs") return { stdout: "standard output\n", stderr: "standard error\n" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", env: { APP_PORT: "4100" }, health: { type: "log", pattern: "standard output" } }, root, runtimeDir: path.join(root, ".devfn", "instances", "test"), instanceId: "test",
      ports: {}, environment: { APP_PORT: "generated", DOCKER_HOST: "tcp://docker.example:2376" },
    });
    expect(managed.containerIds).toEqual(["container-id"]);
    expect(calls.filter((call) => call.args[0] === "compose").every((call) => call.cwd === root && call.appPort === "generated" && call.dockerHost === "tcp://docker.example:2376")).toBe(true);
    const up = calls.find((call) => call.args.includes("up"));
    expect(up?.args).not.toContain("--no-recreate");
    const readinessLogs = calls.find((call) => call.args[0] === "logs" && call.args.includes("--since"));
    expect(readinessLogs?.args[readinessLogs.args.indexOf("--since") + 1]).toBe(managed.startedAt);
    expect(await controller.logs(managed)).toBe("standard output\nstandard error\n");
    await controller.logs(managed, 0);
    expect(calls.findLast((call) => call.args[0] === "logs")?.args).toEqual(["logs", "--tail", "0", "container-id"]);
    await controller.stop(managed);
    expect(calls.filter((call) => ["inspect", "logs", "stop", "rm"].includes(call.args[0])).every((call) => call.dockerHost === "tcp://docker.example:2376")).toBe(true);
  });

  it("clears ambient Docker selectors for new receipts but retains them for legacy receipts", async () => {
    const original = process.env.DOCKER_HOST;
    process.env.DOCKER_HOST = "tcp://ambient.example:2376";
    const observed: Array<string | undefined> = [];
    const controller = stubbed(async (_file, _args, options) => {
      observed.push(options.env?.DOCKER_HOST);
      return { stdout: "true\n", stderr: "" };
    });
    const service = { name: "api", composeService: "api", projectName: "devfn-test", files: [], containerIds: ["container-id"], preExisting: false, wasRunning: false, startedAt: new Date().toISOString() };
    try {
      await controller.status({ ...service, dockerEnvironment: {} });
      await controller.status(service);
    } finally {
      if (original === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = original;
    }
    expect(observed).toEqual([undefined, "tcp://ambient.example:2376"]);
  });

  it("preserves user-owned services but reclaims abandoned DevFn containers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-owner-"));
    const runCase = async (projectName: string | undefined) => {
      const calls: readonly string[][] = [];
      let psCalls = 0;
      const controller = stubbed(async (_file, args) => {
        (calls as string[][]).push([...args]);
        if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
        if (args.includes("ps")) { psCalls += 1; return { stdout: `${projectName || psCalls < 3 ? "old-id" : "new-id"}\n`, stderr: "" }; }
        if (args.includes("--hash")) return { stdout: `api ${MOCK_COMPOSE_HASH}\n`, stderr: "" };
        if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: {} } } }), stderr: "" };
        if (args[0] === "image") return { stdout: '["PATH=/bin"]\n', stderr: "" };
        if (args.includes("{{json .Config.Env}}")) return { stdout: '["PATH=/bin"]\n', stderr: "" };
        if (args.includes("{{json .HostConfig.PortBindings}}")) return { stdout: "{}\n", stderr: "" };
        if (args.includes("{{.Image}}")) return { stdout: "image-id\n", stderr: "" };
        if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? (projectName ? "<no value>\t<no value>\t<no value>\n" : "true\tmanaged\tapi\n") : args.some((arg) => arg.includes("com.docker.compose.config-hash")) ? `${MOCK_COMPOSE_HASH}\n` : "true\n", stderr: "" };
        return { stdout: "", stderr: "" };
      });
      const managed = await controller.start({
        name: "api", spec: { adapter: "compose", service: "api", ...(projectName ? { projectName } : {}) }, root,
        runtimeDir: path.join(root, ".devfn", "instances", projectName ?? "managed"), instanceId: projectName ?? "managed", ports: {},
      });
      return { calls, controller, managed };
    };

    const userOwned = await runCase("shared-project");
    expect(userOwned.calls.find((args) => args.includes("up"))).toContain("--no-recreate");
    expect(userOwned.managed).toMatchObject({ preExisting: true, wasRunning: true });
    await userOwned.controller.stop(userOwned.managed);
    expect(userOwned.calls.some((args) => args[0] === "stop")).toBe(false);

    const abandoned = await runCase(undefined);
    expect(abandoned.calls.find((args) => args.includes("up"))).not.toContain("--no-recreate");
    expect(abandoned.managed).toMatchObject({ containerIds: ["new-id"], preExisting: false, wasRunning: false });
    await abandoned.controller.stop(abandoned.managed);
    expect(abandoned.calls.some((args) => args[0] === "stop" && args.includes("new-id"))).toBe(true);
  });

  it("refuses stale environment in an unmanaged container before Compose up", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-stale-"));
    try {
      for (const running of [true, false]) {
        const calls: string[][] = [];
        const controller = stubbed(async (_file, args) => {
          calls.push([...args]);
          if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
          if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
          if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: { DEVFN_PORT_API: "4102" } } } }), stderr: "" };
          if (args[0] === "inspect") return { stdout: args.includes("{{json .Config.Env}}") ? '["DEVFN_PORT_API=4101"]\n' : "<no value>\t<no value>\t<no value>\n", stderr: "" };
          return { stdout: "", stderr: "" };
        });
        await expect(controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
          runtimeDir: path.join(root, ".devfn", "instances", "owner"), instanceId: "owner", ports: {}, environment: { DEVFN_PORT_API: "4102" } })).rejects.toThrow(/stale startup environment/);
        expect(calls.some((args) => args.includes("up"))).toBe(false);
        expect(calls.some((args) => args[0] === "stop" || args[0] === "rm")).toBe(false);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("refuses unmanaged containers with stale command or leased port config before Compose up", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-stale-hash-"));
    try {
      for (const change of ["command", "port"] as const) for (const running of [true, false]) {
        const calls: string[][] = [];
        const controller = stubbed(async (_file, args) => {
          calls.push([...args]);
          if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
          if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
          if (args.includes("--hash")) return { stdout: `api ${MOCK_COMPOSE_HASH}\n`, stderr: "" };
          if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: {}, command: change === "command" ? ["sleep", "20"] : ["sleep", "10"], ...(change === "port" ? { ports: [{ target: 8080, published: "4102", host_ip: "127.0.0.1", protocol: "tcp" }] } : {}) } } }), stderr: "" };
          if (args[0] === "image") return { stdout: '["PATH=/bin"]\n', stderr: "" };
          if (args.includes("{{json .Config.Env}}")) return { stdout: '["PATH=/bin"]\n', stderr: "" };
          if (args.includes("{{.Image}}")) return { stdout: "image-id\n", stderr: "" };
          if (args.some((arg) => arg.includes("com.docker.compose.config-hash"))) return { stdout: `${change === "command" ? "b".repeat(64) : MOCK_COMPOSE_HASH}\n`, stderr: "" };
          if (args.includes("{{json .HostConfig.PortBindings}}")) return { stdout: change === "port" ? '{"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"4101"}]}\n' : "{}\n", stderr: "" };
          if (args[0] === "inspect") return { stdout: "<no value>\t<no value>\t<no value>\n", stderr: "" };
          return { stdout: "", stderr: "" };
        });
        const error = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared", ...(change === "port" ? { ports: { api: 8080 } } : {}) }, root,
          runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: change === "port" ? { api: 4102 } : {} }).then(() => "", (failure: Error) => failure.message);
        expect(error).toMatch(change === "command" ? /stale startup configuration/ : /stale published ports/);
        expect(calls.some((args) => args.includes("up") || args[0] === "stop" || args[0] === "rm")).toBe(false);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("reuses valid random and ranged unmanaged ports but rejects an outside binding", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-published-"));
    try {
      for (const [published, actual, allowed] of [["", "44001", true], ["44000-44010", "44001", true], ["44000-44010", "44011", false]] as const) {
        const calls: string[][] = [];
        const controller = stubbed(async (_file, args) => {
          calls.push([...args]);
          if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
          if (args.includes("ps")) return { stdout: "old-id\n", stderr: "" };
          if (args.includes("--hash")) return { stdout: `api ${MOCK_COMPOSE_HASH}\n`, stderr: "" };
          if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: {}, ports: [{ target: 8080, published, host_ip: "127.0.0.1", protocol: "tcp" }] } } }), stderr: "" };
          if (args.includes("{{json .Config.Env}}")) return { stdout: "[]\n", stderr: "" };
          if (args.some((arg) => arg.includes("com.docker.compose.config-hash"))) return { stdout: `${MOCK_COMPOSE_HASH}\n`, stderr: "" };
          if (args.includes("{{json .HostConfig.PortBindings}}")) return { stdout: JSON.stringify({ "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: actual }] }) + "\n", stderr: "" };
          if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? "<no value>\t<no value>\t<no value>\n" : "true\n", stderr: "" };
          return { stdout: "", stderr: "" };
        });
        const start = controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
          runtimeDir: path.join(root, `runtime-${published || "random"}-${actual}`), instanceId: "owner", ports: {} });
        if (allowed) {
          const managed = await start;
          expect(managed.preExisting).toBe(true);
          expect(calls.some((args) => args.includes("up"))).toBe(true);
        } else {
          await expect(start).rejects.toThrow(/stale published ports/);
          expect(calls.some((args) => args.includes("up"))).toBe(false);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("refuses removed DevFn startup keys in stopped and running unmanaged containers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-removed-env-"));
    try {
      for (const running of [true, false]) {
        for (const removed of ["DEVFN_URL_API", "DEVFN_PORT_API"]) {
          const calls: string[][] = [];
          const controller = stubbed(async (_file, args) => {
            calls.push([...args]);
            if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
            if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
            if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: { MODE: "current" } } } }), stderr: "" };
            if (args[0] === "inspect") return { stdout: args.includes("{{json .Config.Env}}") ? JSON.stringify(["MODE=current", `${removed}=synthetic-sentinel`]) + "\n" : "<no value>\t<no value>\t<no value>\n", stderr: "" };
            return { stdout: "", stderr: "" };
          });
          const error = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
            runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PROFILE: "default" } }).then(() => "", (failure: Error) => failure.message);
          expect(error).toMatch(/stale startup environment/);
          expect(error).not.toContain("synthetic-sentinel");
          expect(calls.some((args) => args.includes("up") || args[0] === "stop" || args[0] === "rm")).toBe(false);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("refuses removed literal startup keys while allowing image defaults", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-literal-env-"));
    try {
      for (const running of [true, false]) {
        for (const literal of ["MODE", "PROFILE_MODE"]) {
          const calls: string[][] = [];
          const controller = stubbed(async (_file, args) => {
            calls.push([...args]);
            if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
            if (args.includes("ps")) return { stdout: args.includes("-a") || running ? "old-id\n" : "", stderr: "" };
            if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: { CURRENT: "yes" } } } }), stderr: "" };
            if (args[0] === "image") return { stdout: JSON.stringify(["PATH=/bin"]) + "\n", stderr: "" };
            if (args[0] === "inspect") {
              if (args.includes("{{json .Config.Env}}")) return { stdout: JSON.stringify(["CURRENT=yes", "PATH=/bin", `${literal}=synthetic-sentinel`]) + "\n", stderr: "" };
              if (args.includes("{{.Image}}")) return { stdout: "image-id\n", stderr: "" };
              return { stdout: "<no value>\t<no value>\t<no value>\n", stderr: "" };
            }
            return { stdout: "", stderr: "" };
          });
          const error = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
            runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { CURRENT: "yes" } }).then(() => "", (failure: Error) => failure.message);
          expect(error).toMatch(/stale startup environment/);
          expect(error).not.toContain("synthetic-sentinel");
          expect(calls.some((args) => args.includes("up") || args[0] === "stop" || args[0] === "rm")).toBe(false);
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("preserves a real unmanaged container with an old leased value", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-stale-real-"));
    const file = path.join(root, "compose.yaml");
    const projectPrefix = path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 42);
    const projectName = composeProjectName(projectPrefix, "owner");
    await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n    environment:\n      DEVFN_PORT_API: "${DEVFN_PORT_API}"\n');
    try {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "up", "-d", "api"], { cwd: root, env: { ...process.env, DEVFN_PORT_API: "4101" } });
      const controller = new ComposeController();
      await expect(controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: projectPrefix }, root,
        runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PORT_API: "4102" } })).rejects.toThrow(/stale startup environment/);
      const { stdout: id } = await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "ps", "-q", "api"], { cwd: root, env: { ...process.env, DEVFN_PORT_API: "4101" } });
      expect(id.trim()).not.toBe("");
      const { stdout: current } = await execFileAsync("docker", ["inspect", "--format", "{{json .Config.Env}}", id.trim()]);
      expect(JSON.parse(current) as string[]).toContain("DEVFN_PORT_API=4101");
    } finally {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "down"], { cwd: root, env: { ...process.env, DEVFN_PORT_API: "4101" } }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("refuses a removed DevFn URL in a real stopped unmanaged container", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-removed-real-"));
    const file = path.join(root, "compose.yaml");
    const projectPrefix = path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 42);
    const projectName = composeProjectName(projectPrefix, "owner");
    await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n    environment:\n      DEVFN_URL_API: "http://api:4101"\n');
    try {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "up", "-d", "api"], { cwd: root });
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "stop", "api"], { cwd: root });
      await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n');
      const controller = new ComposeController();
      await expect(controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: projectPrefix }, root,
        runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PROFILE: "default" } })).rejects.toThrow(/stale startup environment/);
      const { stdout: id } = await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "ps", "-a", "-q", "api"], { cwd: root });
      expect(id.trim()).not.toBe("");
      const { stdout: state } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", id.trim()]);
      expect(state.trim()).toBe("false");
    } finally {
      await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "down"], { cwd: root }).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 40_000);

  it.skipIf(process.env.DEVFN_REAL_COMPOSE !== "1")("refuses removed literal environment in real running and stopped unmanaged containers", async () => {
    for (const running of [true, false]) {
      const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-literal-real-"));
      const file = path.join(root, "compose.yaml");
      const projectPrefix = path.basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 42);
      const projectName = composeProjectName(projectPrefix, "owner");
      await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n    environment:\n      MODE: "stale-literal"\n');
      try {
        await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "up", "-d", "api"], { cwd: root });
        if (!running) await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "stop", "api"], { cwd: root });
        await writeFile(file, 'services:\n  api:\n    image: node:22-alpine\n    command: ["node", "-e", "setInterval(() => {}, 1000)"]\n');
        const controller = new ComposeController();
        const failure = await controller.start({ name: "api", spec: { adapter: "compose", service: "api", projectName: projectPrefix }, root,
          runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {}, environment: { DEVFN_PROFILE: "default" } }).then(() => "", (error: Error) => error.message);
        expect(failure).toMatch(/stale startup environment/);
        expect(failure).not.toContain("stale-literal");
        const { stdout: id } = await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "ps", "-a", "-q", "api"], { cwd: root });
        const { stdout: state } = await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", id.trim()]);
        expect(state.trim()).toBe(String(running));
      } finally {
        await execFileAsync("docker", ["compose", "-p", projectName, "-f", file, "down"], { cwd: root }).catch(() => undefined);
        await rm(root, { recursive: true, force: true });
      }
    }
  }, 90_000);

  it("restores only user-owned containers that DevFn started", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-mixed-"));
    const calls: string[][] = [];
    let allCalls = 0;
    const controller = stubbed(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps") && args.includes("-a")) { allCalls += 1; return { stdout: allCalls === 1 ? "running-id\nstopped-id\n" : "running-id\nstopped-id\ncreated-id\n", stderr: "" }; }
      if (args.includes("ps")) return { stdout: "running-id\n", stderr: "" };
      if (args.includes("--hash")) return { stdout: `api ${MOCK_COMPOSE_HASH}\n`, stderr: "" };
      if (args.includes("config")) return { stdout: JSON.stringify({ services: { api: { environment: {} } } }), stderr: "" };
      if (args.includes("{{json .Config.Env}}")) return { stdout: "[]\n[]\n", stderr: "" };
      if (args.includes("{{json .HostConfig.PortBindings}}")) return { stdout: "{}\n{}\n", stderr: "" };
      if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? "<no value>\t<no value>\t<no value>\n<no value>\t<no value>\t<no value>\n" : args.some((arg) => arg.includes("com.docker.compose.config-hash")) ? `${MOCK_COMPOSE_HASH}\n${MOCK_COMPOSE_HASH}\n` : "true\ntrue\ntrue\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    const managed = await controller.start({
      name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "current"), instanceId: "current", ports: {},
    });
    expect(managed).toMatchObject({ preExisting: true, wasRunning: false, startedContainerIds: ["stopped-id"], createdContainerIds: ["created-id"] });
    await controller.stop(managed);
    expect(calls.find((args) => args[0] === "stop")).toEqual(["stop", "stopped-id", "created-id"]);
    expect(calls.find((args) => args[0] === "rm")).toEqual(["rm", "-f", "created-id"]);
  });

  it("treats already-removed containers as an idempotent cleanup", async () => {
    let present = true;
    const controller = stubbed(async (_file, args) => {
      if ((args[0] === "stop" || args[0] === "rm") && !present) throw Object.assign(new Error("container missing"), { stderr: "Error: No such container: created-id" });
      if (args[0] === "rm") present = false;
      return { stdout: "", stderr: "" };
    });
    const managed = { name: "api", composeService: "api", projectName: "shared", files: [], containerIds: ["created-id"], preExisting: true, wasRunning: false, startedContainerIds: [], createdContainerIds: ["created-id"], startedAt: new Date().toISOString() };
    await expect(controller.stop(managed)).resolves.toBeUndefined();
    await expect(controller.stop(managed)).resolves.toBeUndefined();
  });

  it("does not reclaim a container owned by another DevFn lifecycle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-other-owner-"));
    const calls: string[][] = [];
    const controller = stubbed(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) return { stdout: "old-id\n", stderr: "" };
      if (args[0] === "inspect") return { stdout: args.some((arg) => arg.includes("devfn.managed")) ? "true\tother-instance\tapi\n" : "true\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    await expect(controller.start({
      name: "api", spec: { adapter: "compose", service: "api", projectName: "shared" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "current"), instanceId: "current", ports: {},
    })).rejects.toThrow(/another DevFn lifecycle/);
    expect(calls.some((args) => args.includes("up"))).toBe(false);
  });

  it("cleans a replacement DevFn container when startup journaling fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-replace-"));
    const calls: string[][] = [];
    let psCalls = 0;
    const controller = stubbed(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) { psCalls += 1; return { stdout: `${psCalls < 3 ? "old-id" : "new-id"}\n`, stderr: "" }; }
      if (args[0] === "inspect") return { stdout: "true\tmanaged\tapi\n", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    await expect(controller.start({
      name: "api", spec: { adapter: "compose", service: "api" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "managed"), instanceId: "managed", ports: {},
      onStarted: async () => { throw new Error("journal failed"); },
    })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED", details: { cause: "journal failed" } });
    expect(calls.some((args) => args[0] === "stop" && args.includes("new-id"))).toBe(true);
    expect(calls.some((args) => args[0] === "rm" && args.includes("new-id"))).toBe(true);
  });

  it("journals Compose recovery when startup cleanup fails before container IDs are known", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-recovery-"));
    const calls: string[][] = [];
    let psCalls = 0;
    let cleanupFails = true;
    let recovery: ManagedComposeService | undefined;
    const controller = stubbed(async (_file, args) => {
      calls.push([...args]);
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("ps")) {
        psCalls += 1;
        if (psCalls === 3) throw new Error("container query failed");
        return { stdout: "", stderr: "" };
      }
      if (args.includes("stop") && cleanupFails) throw new Error("compose cleanup failed");
      return { stdout: "", stderr: "" };
    });
    await expect(controller.start({
      name: "api", spec: { adapter: "compose", service: "api" }, root,
      runtimeDir: path.join(root, ".devfn", "instances", "recovery"), instanceId: "recovery", ports: {},
      onStarted: async (managed) => { recovery = managed; },
    })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_START_FAILED", details: { cleanupCause: "compose cleanup failed" } });
    expect(recovery).toMatchObject({ containerIds: [], composeCwd: root, preExisting: false });
    cleanupFails = false;
    await controller.stop(recovery!);
    expect(calls.filter((args) => args.includes("stop"))).toHaveLength(2);
    expect(calls.some((args) => args.includes("rm"))).toBe(true);
  });

  it("journals a launch and then its launcher before Compose runs and stops what an interrupted launch started, leaving containers that already ran", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-compose-launch-"));
    const order: string[] = [];
    let psCalls = 0;
    const launching = stubbed(async (_file, args) => {
      if (args.includes("version")) return { stdout: "2.24.4", stderr: "" };
      if (args.includes("up")) { order.push("up"); throw new Error("interrupted"); }
      if (args.includes("ps")) return { stdout: ++psCalls >= 3 ? "created\n" : "", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    try {
      const launches: ComposeLaunch[] = [];
      await expect(launching.start({ name: "db", spec: { adapter: "compose", service: "db" }, root, runtimeDir: path.join(root, "runtime"), instanceId: "owner", ports: {},
        onLaunch: async (value) => { order.push("journal"); launches.push(value); } })).rejects.toBeDefined();
      expect(order).toEqual(["journal", "journal", "up"]);
      expect(launches[0]).toMatchObject({ name: "db", composeService: "db", preExisting: false, existingContainerIds: [], runningContainerIds: [] });
      expect(launches[0].launcher).toBeUndefined();
      expect(launches[1]).toEqual({ ...launches[0], launcher: ABSENT_LAUNCHER });
    } finally { await rm(root, { recursive: true, force: true }); }


    const calls: string[][] = [];
    // A Docker daemon model: ps lists each container with its state, stop and
    // rm act on it, and onScan lets a test finish a request the killed
    // launcher already sent.
    const docker = (initial: Array<[id: string, lifecycle: string, state: string]>, onScan?: (scan: number, containers: Map<string, { lifecycle: string; state: string }>) => void) => {
      const containers = new Map(initial.map(([id, lifecycle, state]) => [id, { lifecycle, state }]));
      let scan = 0;
      return stubbed(async (_file, args) => {
        calls.push(args);
        if (args[0] === "ps") {
          onScan?.(scan++, containers);
          return { stdout: [...containers].map(([id, { lifecycle, state }]) => `${id}\t${lifecycle}\t${state}\n`).join(""), stderr: "" };
        }
        for (const id of args.slice(args[0] === "rm" ? 2 : 1)) {
          if (args[0] === "stop" && containers.has(id)) containers.get(id)!.state = "exited";
          if (args[0] === "rm") containers.delete(id);
        }
        return { stdout: "", stderr: "" };
      });
    };
    const base = { name: "db", projectName: "devfn-owner", composeService: "db", dockerEnvironment: { DOCKER_HOST: "unix:///fixture.sock" } };
    const actions = () => calls.filter((args) => args[0] !== "ps");
    const scans = () => calls.filter((args) => args[0] === "ps").length;
    // A sibling lifecycle sharing the project and service is never matched.
    await docker([["fresh-a", "db", "running"], ["sibling", "other", "running"], ["fresh-b", "db", "exited"]]).stopLaunch({ ...base, preExisting: false, existingContainerIds: [], runningContainerIds: [] });
    expect(calls[0]).toEqual(["ps", "-a", "--no-trunc", "--filter", "label=com.docker.compose.project=devfn-owner", "--filter", "label=com.docker.compose.service=db",
      "--format", '{{.ID}}\t{{.Label "devfn.lifecycle"}}\t{{.State}}']);
    expect(actions()).toEqual([["stop", "fresh-a", "fresh-b"], ["rm", "-f", "fresh-a", "fresh-b"]]);
    expect(scans()).toBe(2);

    // A reused service keeps the container that ran before the launch, and
    // stops one the launch started.
    calls.length = 0;
    await docker([["ran-before", "", "running"], ["stopped-before", "", "running"], ["never-started", "", "exited"], ["new", "db", "created"]])
      .stopLaunch({ ...base, preExisting: true, existingContainerIds: ["ran-before", "stopped-before", "never-started"], runningContainerIds: ["ran-before"] });
    expect(actions()).toEqual([["stop", "stopped-before", "new"], ["rm", "-f", "new"]]);

    // A start request the killed launcher already sent restarts a container
    // the first pass stopped: a later pass re-reads its state and stops it
    // again, and the launch resolves only after a quiet pass.
    calls.length = 0;
    await docker([["stopped-before", "", "running"]], (scan, containers) => { if (scan === 1) containers.get("stopped-before")!.state = "running"; })
      .stopLaunch({ ...base, preExisting: true, existingContainerIds: ["stopped-before"], runningContainerIds: [] });
    expect(actions()).toEqual([["stop", "stopped-before"], ["stop", "stopped-before"]]);
    expect(scans()).toBe(3);

    // A container Docker creates for a request the killed launcher already
    // sent is found by a later scan and stopped too.
    calls.length = 0;
    await docker([["early", "db", "running"]], (scan, containers) => { if (scan === 1) containers.set("late", { lifecycle: "db", state: "running" }); })
      .stopLaunch({ ...base, preExisting: false, existingContainerIds: [], runningContainerIds: [] });
    expect(actions()).toEqual([["stop", "early"], ["rm", "-f", "early"], ["stop", "late"], ["rm", "-f", "late"]]);
    expect(scans()).toBe(3);

    // A launch that keeps starting what was stopped is not resolved.
    calls.length = 0;
    await expect(docker([["stopped-before", "", "running"]], (_scan, containers) => { containers.get("stopped-before")!.state = "running"; })
      .stopLaunch({ ...base, preExisting: true, existingContainerIds: ["stopped-before"], runningContainerIds: [] })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_STOP_FAILED" });
    // Neither is one that never stops creating containers.
    let created = 0;
    await expect(docker([], (_scan, containers) => { containers.set(`c${created++}`, { lifecycle: "db", state: "running" }); })
      .stopLaunch({ ...base, preExisting: false, existingContainerIds: [], runningContainerIds: [] })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_STOP_FAILED" });
    // A container in a state Docker does not report as stopped may be running.
    await expect(docker([["stopped-before", "", ""]], (_scan, containers) => { containers.get("stopped-before")!.state = ""; })
      .stopLaunch({ ...base, preExisting: true, existingContainerIds: ["stopped-before"], runningContainerIds: [] })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_STOP_FAILED" });

    // An unreachable Docker endpoint proves nothing about what the launch started.
    await expect(stubbed(async () => { throw new Error("Cannot connect to the Docker daemon"); })
      .stopLaunch({ ...base, preExisting: false, existingContainerIds: [], runningContainerIds: [] })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_STOP_FAILED" });
  });

  it.skipIf(process.platform === "win32")("resolves an interrupted launch only once its launcher and everything it started are gone", async () => {
    const calls: string[][] = [];
    const emptyScan = stubbed(async (_file, args) => { calls.push(args); return { stdout: "", stderr: "" }; });
    const base = { name: "db", projectName: "devfn-owner", composeService: "db", preExisting: false, existingContainerIds: [], runningContainerIds: [] };

    // A launcher whose own process died leaves its child running: unresolved,
    // and the scan is not trusted.
    const orphaned = await launchFromDyingCli();
    try {
      expect(await gatedLauncherStatus(orphaned)).toBe("running");
      process.kill(orphaned.pid, "SIGKILL");
      await waitForLauncherStatus(orphaned, (status) => status !== "running");
      expect(await gatedLauncherStatus(orphaned)).toBe("unverified");
      await expect(emptyScan.stopLaunch({ ...base, launcher: orphaned })).rejects.toMatchObject({ code: "DEVFN_COMPOSE_STOP_FAILED" });
      expect(calls).toEqual([]);
    } finally { try { process.kill(-orphaned.pid, "SIGKILL"); } catch { /* already gone */ } }
    await waitForLauncherStatus(orphaned, (status) => status === "gone");
    await emptyScan.stopLaunch({ ...base, launcher: orphaned });
    expect(calls.map((args) => args[0])).toEqual(["ps", "ps"]);

    // A verified launcher is stopped with everything it started before the scan.
    calls.length = 0;
    const pending = await launchFromDyingCli();
    try {
      await emptyScan.stopLaunch({ ...base, launcher: pending });
      expect(await gatedLauncherStatus(pending)).toBe("gone");
      expect(calls.map((args) => args[0])).toEqual(["ps", "ps"]);
    } finally { try { process.kill(-pending.pid, "SIGKILL"); } catch { /* already gone */ } }
    // Real process groups are started and stopped, with bounded waits of their own.
  }, 60_000);
});

// The launcher wrapper exists only in the built processes package, so these
// run here rather than in its own sources' tests.
describe("gated Compose launcher", () => {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("runs a command only after its launcher identity is recorded, and never when recording fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-gated-"));
    const marker = path.join(root, "ran");
    const touch = ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.stdout.write('out'); process.stderr.write('err');`];
    try {
      let launcherAlive = false;
      const output = await runGatedCommand(process.execPath, touch, { onLaunched: async (launcher) => {
        launcherAlive = await gatedLauncherStatus(launcher) === "running";
        await delay(200);
        await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
      } });
      expect(launcherAlive).toBe(true);
      expect(output).toEqual({ stdout: "out", stderr: "err" });

      await rm(marker);
      let recorded: { pid: number; birthSignature?: string } | undefined;
      await expect(runGatedCommand(process.execPath, touch, { onLaunched: async (launcher) => { recorded = launcher; throw new Error("journal unavailable"); } })).rejects.toThrow("journal unavailable");
      expect(await gatedLauncherStatus(recorded!)).toBe("gone");
      await delay(200);
      await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });

      await expect(runGatedCommand(process.execPath, ["-e", "process.stderr.write('denied'); process.exit(3)"], { onLaunched: async () => undefined }))
        .rejects.toMatchObject({ code: 3, stderr: "denied" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.skipIf(process.platform === "win32")("stops a timed-out launcher, or one that exited, with everything it started", async () => {
    let recorded: { pid: number; birthSignature?: string } | undefined;
    const script = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }); setTimeout(() => {}, 60000);";
    await expect(runGatedCommand(process.execPath, ["-e", script], { timeout: 500, onLaunched: async (launcher) => { recorded = launcher; } })).rejects.toMatchObject({ killed: true });
    expect(await gatedLauncherStatus(recorded!)).toBe("gone");

    // A command that exits but leaves a process behind returns only once that is gone too.
    const leftover = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' }).unref();";
    await runGatedCommand(process.execPath, ["-e", leftover], { onLaunched: async (launcher) => { recorded = launcher; } });
    expect(await gatedLauncherStatus(recorded!)).toBe("gone");
  });

  it.skipIf(process.platform === "win32")("returns once a command exits although a process it left behind holds its output open, and stops that process", async () => {
    let recorded: { pid: number; birthSignature?: string } | undefined;
    // No timeout bounds this command; only the drain after its exit does.
    const holder = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' }).unref(); process.stdout.write('done');";
    const started = Date.now();
    const output = await runGatedCommand(process.execPath, ["-e", holder], { onLaunched: async (launcher) => { recorded = launcher; } });
    expect(output.stdout).toBe("done");
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(await gatedLauncherStatus(recorded!)).toBe("gone");
  }, 30_000);

  it("never runs a wrapped command without its launch gate channel", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-ungated-"));
    const marker = path.join(root, "ran");
    try {
      const wrapper = spawn(process.execPath, [fileURLToPath(new URL("../../processes/dist/wrapper.js", import.meta.url))], {
        env: { ...process.env, DEVFN_WRAPPED_COMMAND: JSON.stringify([process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`]), DEVFN_REDACT_KEYS: "[]" },
        stdio: "ignore",
      });
      expect(await new Promise((resolve) => wrapper.once("exit", resolve))).toBe(1);
      await delay(200);
      await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("redacts declared secret values from a gated command's output", async () => {
    const secret = "gated-secret-value-4417";
    const output = await runGatedCommand(process.execPath, ["-e", "process.stdout.write(`token=${process.env.GATED_TOKEN}`); process.stderr.write(process.env.GATED_TOKEN)"],
      { env: { ...process.env, GATED_TOKEN: secret }, redactKeys: ["GATED_TOKEN"], onLaunched: async () => undefined });
    expect(output.stdout).toContain("token=");
    expect(`${output.stdout}${output.stderr}`).not.toContain(secret);
  });

  it.skipIf(process.platform === "win32")("stops a launcher as soon as its output passes the limit, keeping only the bounded output", async () => {
    let recorded: { pid: number; birthSignature?: string } | undefined;
    // The command would write forever; no timeout bounds it.
    const flood = "const chunk = 'x'.repeat(4096); setInterval(() => { process.stdout.write(chunk); process.stderr.write(chunk); }, 1);";
    const started = Date.now();
    const failure = await runGatedCommand(process.execPath, ["-e", flood], { maxBuffer: 64 * 1024, onLaunched: async (launcher) => { recorded = launcher; } })
      .then(() => undefined, (error: unknown) => error as { message: string; stdout: string; stderr: string });
    expect(failure?.message).toMatch(/output exceeded 65536 bytes/);
    expect(Buffer.byteLength(failure!.stdout)).toBeLessThanOrEqual(64 * 1024);
    expect(Buffer.byteLength(failure!.stderr)).toBeLessThanOrEqual(64 * 1024);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(await gatedLauncherStatus(recorded!)).toBe("gone");
  }, 30_000);

  it.skipIf(process.platform === "win32")("treats a launcher whose PID now belongs to another process as gone, without signalling that process", async () => {
    // An unrelated process leads its own group under the recorded launcher's PID.
    const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { detached: true, stdio: "ignore" });
    unrelated.unref();
    try {
      const [scheme] = (await readBirthSignature(unrelated.pid!)).split(":");
      const reused = { pid: unrelated.pid!, birthSignature: `${scheme}:a launcher that exited long ago` };
      expect(await gatedLauncherStatus(reused)).toBe("gone");
      const calls: string[][] = [];
      await stubbed(async (_file, args) => { calls.push(args); return { stdout: "", stderr: "" }; })
        .stopLaunch({ name: "db", projectName: "devfn-owner", composeService: "db", preExisting: false, existingContainerIds: [], runningContainerIds: [], launcher: reused });
      expect(calls.map((args) => args[0])).toEqual(["ps", "ps"]);
      expect(unrelated.exitCode).toBeNull();
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    } finally { try { process.kill(-unrelated.pid!, "SIGKILL"); } catch { /* already gone */ } }
  });

});
