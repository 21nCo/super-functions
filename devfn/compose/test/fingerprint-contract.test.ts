import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createComposeEnvironment, fingerprintComposeSource } from "../src/index.js";

const live = process.env.DEVFN_REAL_COMPOSE === "1";
const composeVersion = live ? execFileSync("docker", ["compose", "version", "--short"], { encoding: "utf8" }).trim() : "";
const lacksBuildPrivileged = /^v?2\.24\.4$/.test(composeVersion);

describe.skipIf(!live)("effective Compose startup fingerprint", () => {
  it("accepts Compose BOM and tab export syntax while tracking effective ordinary values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-bom-tab-"));
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: [base.env, active.env]\n");
      await writeFile(path.join(root, "base.env"), "MODE=overridden\n");
      await writeFile(path.join(root, "active.env"), "\uFEFFexport\tMODE=one\n");
      const first = await fingerprint();
      await writeFile(path.join(root, "base.env"), "MODE=still-overridden\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(path.join(root, "active.env"), "\uFEFFexport\tMODE=two\n");
      expect(await fingerprint()).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("keeps a leaf default secret private beneath a parent explicit include environment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-leaf-secret-"));
    const spec = { adapter: "compose" as const, service: "api", secretEnv: ["CUSTOM"] };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await mkdir(path.join(root, "child", "leaf"), { recursive: true });
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: child/compose.yaml\n    env_file: child/scope.env\n");
      await writeFile(path.join(root, "child", "scope.env"), "MODE=one\n");
      await writeFile(path.join(root, "child", "compose.yaml"), "include: [leaf/compose.yaml]\n");
      await writeFile(path.join(root, "child", "leaf", ".env"), "CUSTOM=private-one\n");
      await writeFile(path.join(root, "child", "leaf", "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: 'echo ${CUSTOM:-none} ${MODE:-none}'\n");
      const first = await fingerprint();
      await writeFile(path.join(root, "child", "leaf", ".env"), "CUSTOM=private-two\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(path.join(root, "child", "scope.env"), "MODE=two\n");
      expect(await fingerprint()).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("resolves a leaf env_file path from an outer explicit include environment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-outer-path-"));
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await mkdir(path.join(root, "child", "leaf"), { recursive: true });
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: child/compose.yaml\n    env_file: child/scope.env\n");
      await writeFile(path.join(root, "child", "scope.env"), "FILE_PATH=service.env\n");
      await writeFile(path.join(root, "child", "compose.yaml"), "include: [leaf/compose.yaml]\n");
      await writeFile(path.join(root, "child", "leaf", "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: ${FILE_PATH}\n");
      await writeFile(path.join(root, "child", "leaf", "service.env"), "MODE=one\n");
      const first = await fingerprint();
      await writeFile(path.join(root, "child", "leaf", "service.env"), "MODE=two\n");
      expect(await fingerprint()).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("resolves a nested include path from an outer explicit include environment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-outer-include-path-"));
    const spec = { adapter: "compose" as const, service: "api" };
    try {
      await mkdir(path.join(root, "child", "leaf"), { recursive: true });
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: child/compose.yaml\n    env_file: child/scope.env\n");
      await writeFile(path.join(root, "child", "scope.env"), "NEXT=leaf/compose.yaml\n");
      await writeFile(path.join(root, "child", "compose.yaml"), "include: ['${NEXT}']\n");
      await writeFile(path.join(root, "child", "leaf", "compose.yaml"), "services:\n  api:\n    image: busybox\n");
      await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).resolves.toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(lacksBuildPrivileged)("masks build privileged with a Compose-valid boolean", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-build-boolean-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["BUILD_SECRET"], secretEnv: ["BUILD_SECRET"] };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    build:\n      context: .\n      privileged: ${BUILD_SECRET}\n");
      for (const value of ["true", "false"]) {
        await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, BUILD_SECRET: value })))
          .resolves.toMatch(/^[a-f0-9]{64}$/);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.skipIf(lacksBuildPrivileged)("checks inherited unique volumes when typed fields force source fallback", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-fallback-volume-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["BUILD_SECRET"], secretEnv: ["BUILD_SECRET"] };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, BUILD_SECRET: "true" }));
    try {
      await writeFile(path.join(root, "base.yaml"), "services:\n  base:\n    image: busybox\n    volumes: ['${HOME}:/data']\n");
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    volumes: ['./safe:/extra']\n    build:\n      context: .\n      privileged: ${BUILD_SECRET}\n");
      await expect(fingerprint()).rejects.toThrow(/inherited host value/);
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    volumes: ['./safe:/data']\n    build:\n      context: .\n      privileged: ${BUILD_SECRET}\n");
      await expect(fingerprint()).resolves.toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("deduplicates equal include scopes before probing secret presence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-probe-scopes-"));
    const wrapperDirectory = path.join(root, "bin");
    const log = path.join(root, "probes.log");
    const docker = execFileSync("which", ["docker"], { encoding: "utf8" }).trim();
    const spec = { adapter: "compose" as const, file: "scope0.yaml", service: "api", secretEnv: ["CUSTOM"], env: { DEVFN_PROBE_LOG: log } };
    try {
      await mkdir(wrapperDirectory);
      await writeFile(path.join(wrapperDirectory, "docker"), `#!/bin/sh\ncase "$*" in *devfn-compose-presence-*) echo probe >> "$DEVFN_PROBE_LOG";; esac\nexec "${docker}" "$@"\n`);
      await chmod(path.join(wrapperDirectory, "docker"), 0o700);
      await writeFile(path.join(root, ".env"), "CUSTOM=private-one\n");
      for (let index = 0; index < 12; index += 1) {
        await writeFile(path.join(root, `scope${index}.yaml`), index === 11
          ? "services:\n  api:\n    image: busybox\n    command: 'echo ${CUSTOM}'\n"
          : `include: [scope${index + 1}.yaml]\n`);
      }
      const environment = createComposeEnvironment(spec, {}, { ...process.env, PATH: `${wrapperDirectory}:${process.env.PATH}` });
      await expect(fingerprintComposeSource(spec, root, "owner", environment)).resolves.toMatch(/^[a-f0-9]{64}$/);
      const count = (await readFile(log, "utf8")).trim().split("\n").length;
      expect(count).toBe(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("probes distinct include scopes concurrently under one budget", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-probe-parallel-"));
    const wrapperDirectory = path.join(root, "bin");
    const log = path.join(root, "probes.log");
    const docker = execFileSync("which", ["docker"], { encoding: "utf8" }).trim();
    const spec = { adapter: "compose" as const, file: "scope0/compose.yaml", service: "api", secretEnv: ["CUSTOM"], env: { DEVFN_PROBE_LOG: log } };
    try {
      await mkdir(wrapperDirectory);
      await writeFile(path.join(wrapperDirectory, "docker"), `#!/bin/sh\ncase "$*" in *devfn-compose-presence-*) echo start >> "$DEVFN_PROBE_LOG"; sleep 0.2; echo end >> "$DEVFN_PROBE_LOG";; esac\nexec "${docker}" "$@"\n`);
      await chmod(path.join(wrapperDirectory, "docker"), 0o700);
      for (let index = 0; index < 8; index += 1) {
        const directory = path.join(root, `scope${index}`);
        await mkdir(directory);
        await writeFile(path.join(directory, "compose.yaml"), index === 7
          ? "services:\n  api:\n    image: busybox\n    command: 'echo ${CUSTOM:-none}'\n"
          : `include: [../scope${index + 1}/compose.yaml]\n`);
      }
      await writeFile(path.join(root, "scope7", ".env"), "CUSTOM=private-one\n");
      const environment = createComposeEnvironment(spec, {}, { ...process.env, PATH: `${wrapperDirectory}:${process.env.PATH}` });
      await expect(fingerprintComposeSource(spec, root, "owner", environment)).resolves.toMatch(/^[a-f0-9]{64}$/);
      const entries = (await readFile(log, "utf8")).trim().split("\n");
      expect(entries).toHaveLength(16);
      expect(entries.slice(0, 2)).toEqual(["start", "start"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("accepts escaped dollars and tracks ordinary quoted env_file values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-quoted-env-"));
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: [base.env, service.env]\n");
      await writeFile(path.join(root, "base.env"), "MODE=overridden\n");
      await writeFile(path.join(root, "service.env"), 'MODE="\\$HOME"\nLABEL=\'one\'\n');
      const first = await fingerprint();
      await writeFile(path.join(root, "base.env"), "MODE=changed-but-overridden\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(path.join(root, "service.env"), 'MODE="\\$HOME"\nLABEL=\'two\'\n');
      expect(await fingerprint()).not.toBe(first);
      await writeFile(path.join(root, "service.env"), "MODE=${HOME}\nLABEL='two'\n");
      await expect(fingerprint()).rejects.toThrow(/inherited host value/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("keeps an intermediate include secret out of the selected digest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-nested-include-"));
    const spec = { adapter: "compose" as const, service: "api", secretEnv: ["CUSTOM"] };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await mkdir(path.join(root, "child", "grand"), { recursive: true });
      await writeFile(path.join(root, "compose.yaml"), "include: [child/compose.yaml]\n");
      await writeFile(path.join(root, "child", "compose.yaml"), "include: [grand/compose.yaml]\n");
      await writeFile(path.join(root, "child", ".env"), "CUSTOM=private-one\n");
      await writeFile(path.join(root, "child", "grand", "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: 'echo ${CUSTOM:-none}'\n");
      const first = await fingerprint();
      await writeFile(path.join(root, "child", ".env"), "CUSTOM=private-two\n");
      expect(await fingerprint()).toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("keeps a false external network with a driver valid during masking", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-false-network-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["FLAG"], secretEnv: ["FLAG"] };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    networks: [shared]\nnetworks:\n  shared:\n    external: ${FLAG}\n    driver: bridge\n");
      await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, FLAG: "false" })))
        .resolves.toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("masks dotted and hyphenated environment keys after secret interpolation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-mapped-credential-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret }));
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    environment:\n      db.password: ${CUSTOM}\n      db-password: ${CUSTOM}\n      MODE: one\n");
      const first = await fingerprint("private-one");
      expect(await fingerprint("private-two")).toBe(first);
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    environment:\n      db.password: ${CUSTOM}\n      db-password: ${CUSTOM}\n      MODE: two\n");
      expect(await fingerprint("private-two")).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("accepts credential keys that are not Compose interpolation variables", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-credential-keys-"));
    const spec = { adapter: "compose" as const, service: "api" };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: service.env\n");
      await writeFile(path.join(root, "service.env"), "db.password=private-one\ndb-password=private-one\nMODE=one\n");
      const first = await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
      await writeFile(path.join(root, "service.env"), "db.password=private-two\ndb-password=private-two\nMODE=one\n");
      expect(await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).toBe(first);
      await writeFile(path.join(root, "service.env"), "db.password=private-two\ndb-password=private-two\nMODE=two\n");
      expect(await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("masks selected Boolean resources using a type-valid sentinel", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-resource-boolean-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["FLAG"], secretEnv: ["FLAG"] };
    const fingerprint = (flag: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, FLAG: flag }));
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    networks: [shared]\nnetworks:\n  shared:\n    name: shared\n    external: ${FLAG}\n");
      const first = await fingerprint("true");
      expect(await fingerprint("false")).toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("applies parent project environment precedence to included services", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-parent-env-"));
    const spec = { adapter: "compose" as const, service: "api", secretEnv: ["CUSTOM"] };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await mkdir(path.join(root, "child"));
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: child/compose.yaml\n    env_file: child/scope.env\n");
      await writeFile(path.join(root, "child", "scope.env"), "CUSTOM=scope-private\nMODE=one\n");
      await writeFile(path.join(root, "child", "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: echo ${CUSTOM:-${MODE}}\n");
      await writeFile(path.join(root, ".env"), "CUSTOM=private-one\n");
      const first = await fingerprint();
      await writeFile(path.join(root, ".env"), "CUSTOM=private-two\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(path.join(root, "child", "scope.env"), "CUSTOM=scope-private\nMODE=two\n");
      expect(await fingerprint()).toBe(first);
      await writeFile(path.join(root, ".env"), "CUSTOM=\n");
      const fallback = await fingerprint();
      expect(fallback).not.toBe(first);
      await writeFile(path.join(root, "child", "scope.env"), "CUSTOM=scope-private\nMODE=three\n");
      expect(await fingerprint()).not.toBe(fallback);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("tracks an ordinary fallback when an optional secret is absent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-absent-secret-"));
    const spec = { adapter: "compose" as const, service: "api", secretEnv: ["CUSTOM"] };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    command: 'echo ${CUSTOM:-${MODE}}'\n");
      await writeFile(path.join(root, ".env"), "MODE=one\n");
      const first = await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
      await writeFile(path.join(root, ".env"), "MODE=two\n");
      const ordinary = await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
      expect(ordinary).not.toBe(first);
      await writeFile(path.join(root, ".env"), "MODE=two\nCUSTOM=\n");
      expect(await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).toBe(ordinary);
      await writeFile(path.join(root, ".env"), "MODE=two\nCUSTOM=private-one\n");
      const present = await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
      expect(present).not.toBe(ordinary);
      await writeFile(path.join(root, ".env"), "MODE=two\nCUSTOM=private-two\n");
      expect(await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).toBe(present);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("keeps typed secret interpolation stable and excludes project-env credentials", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-typed-secret-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM", "FLAG"], secretEnv: ["CUSTOM", "FLAG"] };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    expose: ['${CUSTOM}']\n    tty: ${FLAG}\n    command: 'echo ${API_TOKEN}'\n  unrelated:\n    image: busybox\n    command: 'echo one'\n");
      await writeFile(path.join(root, ".env"), "API_TOKEN=private-one\n");
      const fingerprint = (custom: string, flag: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: custom, FLAG: flag }));
      const first = await fingerprint("10010", "true");
      expect(await fingerprint("10020", "false")).toBe(first);
      await writeFile(path.join(root, ".env"), "API_TOKEN=private-two\n");
      expect(await fingerprint("10020", "false")).toBe(first);
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    expose: ['${CUSTOM}']\n    tty: ${FLAG}\n    command: 'echo ${API_TOKEN}'\n  unrelated:\n    image: busybox\n    command: 'echo two'\n");
      expect(await fingerprint("10020", "false")).toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("accepts dotted env_file keys and tracks ordinary values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-dotted-env-"));
    const spec = { adapter: "compose" as const, service: "api" };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: [first.env, service.env]\n");
      await writeFile(path.join(root, "first.env"), "app.mode=overridden\n");
      await writeFile(path.join(root, "service.env"), "app.mode=one\n");
      const first = await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
      await writeFile(path.join(root, "first.env"), "app.mode=still-overridden\n");
      expect(await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).toBe(first);
      await writeFile(path.join(root, "service.env"), "app.mode=two\n");
      expect(await fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("resolves an unbraced env_file path on supported Compose versions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-unbraced-env-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["ENV_FILE"] };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: $ENV_FILE\n");
      await writeFile(path.join(root, "service.env"), "MODE=one\n");
      const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, ENV_FILE: "service.env" }));
      const first = await fingerprint();
      await writeFile(path.join(root, "service.env"), "MODE=two\n");
      expect(await fingerprint()).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
  it("separates short secrets from equal ordinary literals and string commands", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-provenance-"));
    const source = path.join(root, "compose.yaml");
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret }));
    const document = (mode: string, command: string, device: string) => `services:\n  api:\n    image: busybox\n    command: "${command}"\n    environment:\n      CUSTOM: \${CUSTOM}\n      MODE: '${mode}'\n    volumes: [auth:/data]\nvolumes:\n  auth:\n    driver_opts:\n      device: ${device}\n`;
    try {
      await writeFile(source, document("10", "sleep ${CUSTOM}", "/tmp/one"));
      const first = await fingerprint("10");
      expect(await fingerprint("20")).toBe(first);
      await writeFile(source, document("11", "sleep ${CUSTOM}", "/tmp/one"));
      expect(await fingerprint("10")).not.toBe(first);
      await writeFile(source, document("10", "sleep ${CUSTOM}", "/tmp/two"));
      expect(await fingerprint("10")).not.toBe(first);
      await writeFile(source, document("10", "echo ${CUSTOM}", "/tmp/one"));
      expect(await fingerprint("10")).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("tracks selected secret definitions while excluding secret file bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-secret-definition-"));
    const source = path.join(root, "compose.yaml");
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await writeFile(path.join(root, "first.txt"), "private-one");
      await writeFile(path.join(root, "second.txt"), "private-two");
      await writeFile(source, "services:\n  api:\n    image: busybox\n    secrets: [credential]\nsecrets:\n  credential:\n    file: first.txt\n");
      const first = await fingerprint();
      await writeFile(path.join(root, "first.txt"), "private-rotated");
      expect(await fingerprint()).toBe(first);
      await writeFile(source, "services:\n  api:\n    image: busybox\n    secrets: [credential]\nsecrets:\n  credential:\n    file: second.txt\n");
      expect(await fingerprint()).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it.each([
    { title: "uses env_file interpolation provenance for secret aliases", compose: "services:\n  api:\n    image: busybox\n    env_file: ${FILE_PATH}\n",
      file: "service.env", before: "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=10\n", after: "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=11\n", pathVariable: true },
    { title: "tracks ordinary project interpolation inside a mixed secret command", compose: "services:\n  api:\n    image: busybox\n    command: 'echo ${MODE} ${CUSTOM}'\n",
      file: ".env", before: "MODE=one\n", after: "MODE=two\n", pathVariable: false },
    { title: "accepts Compose env_file quoting while tracking ordinary edits and excluding secrets", compose: "services:\n  api:\n    image: busybox\n    env_file: service.env\n",
      file: "service.env", before: "export ALIAS=prefix-${CUSTOM}\nLITERAL='${HOME}'\nMULTI='first\nsecond'\nMODE: one\n",
      after: "export ALIAS=prefix-${CUSTOM}\nLITERAL='${HOME}'\nMULTI='first\nsecond'\nMODE: two\n", pathVariable: false },
    { title: "preserves scalar and list env_file order across extends", compose: "services:\n  base:\n    image: busybox\n    env_file: first.env\n  api:\n    extends: base\n    env_file: [second.env]\n",
      file: "first.env", before: "ALIAS=prefix-${CUSTOM}\nMODE=one\n", after: "ALIAS=prefix-${CUSTOM}\nMODE=two\n",
      extraFile: ["second.env", "CURRENT=one\n"], pathVariable: false },
  ])("$title", async ({ compose, file, before, after, pathVariable, extraFile }) => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-mixed-source-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: pathVariable ? ["CUSTOM", "FILE_PATH"] : ["CUSTOM"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, {
      ...process.env, CUSTOM: secret, ...(pathVariable ? { FILE_PATH: path.join(root, file) } : {}),
    }));
    try {
      await writeFile(path.join(root, "compose.yaml"), compose);
      await writeFile(path.join(root, file), before);
      if (extraFile) await writeFile(path.join(root, extraFile[0]), extraFile[1]);
      const first = await fingerprint("private-one");
      expect(await fingerprint("private-two")).toBe(first);
      await writeFile(path.join(root, file), after);
      expect(await fingerprint("private-two")).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("tracks nested extends and interpolated bind mounts on supported Compose versions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-extends-bind-"));
    const source = path.join(root, "compose.yaml");
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM", "BIND_DIR"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string, bind: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret, BIND_DIR: bind }));
    try {
      await writeFile(source, "services:\n  grand:\n    image: busybox\n    environment:\n      ALIAS: prefix-${CUSTOM}\n  base:\n    extends: grand\n    environment:\n      MODE: base\n  api:\n    extends: base\n    volumes: ['${BIND_DIR}:/data']\n");
      const first = await fingerprint("10", root);
      expect(await fingerprint("20", root)).toBe(first);
      expect(await fingerprint("10", path.join(root, "elsewhere"))).not.toBe(first);
      await writeFile(source, "services:\n  grand:\n    image: busybox\n    environment:\n      ALIAS: prefix-${CUSTOM}\n  base:\n    extends: grand\n    environment:\n      MODE: changed\n  api:\n    extends: base\n    volumes: ['${BIND_DIR}:/data']\n");
      expect(await fingerprint("10", root)).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("uses the declaring file for an inherited env_file secret alias", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-extends-env-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret }));
    try {
      await mkdir(path.join(root, "base"));
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    extends:\n      file: base/base.yaml\n      service: base\n");
      await writeFile(path.join(root, "base", "base.yaml"), "services:\n  base:\n    image: busybox\n    env_file: base.env\n");
      await writeFile(path.join(root, "base.env"), "MODE=unrelated\n");
      await writeFile(path.join(root, "base", "base.env"), "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=one\n");
      const first = await fingerprint("10");
      expect(await fingerprint("20")).toBe(first);
      await writeFile(path.join(root, "base.env"), "MODE=changed-unrelated\n");
      expect(await fingerprint("10")).toBe(first);
      await writeFile(path.join(root, "base", "base.env"), "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=two\n");
      expect(await fingerprint("10")).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("rejects inherited interpolation in an env_file without secret declarations", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-env-inherited-"));
    const spec = { adapter: "compose" as const, service: "api" };
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: service.env\n");
      await writeFile(path.join(root, "service.env"), "MODE=${HOME}\n");
      await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec)))
        .rejects.toThrow(/inherited host value/);
      await writeFile(path.join(root, "service.env"), "MODE='${HOME}'\n");
      await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec)))
        .resolves.toMatch(/^[a-f0-9]{64}$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("retains a literal command edit when the same bytes also rotate through secret interpolation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-secret-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] };
    const source = path.join(root, "compose.yaml");
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "opaque-owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret }));
    const document = (command: string, prefix = "prefix") => `services:\n  api:\n    image: busybox\n    command: [sleep, '${command}']\n    environment:\n      CUSTOM: \${CUSTOM}\n      SESSION_VALUE: '${prefix}-\${CUSTOM}'\n`;
    try {
      await writeFile(source, document("10"));
      const first = await fingerprint("10");
      expect(await fingerprint("20")).toBe(first);
      await writeFile(source, document("10", "prefix-10"));
      const literal = await fingerprint("10");
      await writeFile(source, document("10", "prefix-20"));
      expect(await fingerprint("20")).not.toBe(literal);
      await writeFile(source, document("20"));
      expect(await fingerprint("20")).not.toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("checks interpolation in selected merged values, including single quotes, without rejecting overridden base values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-merge-"));
    const spec = { adapter: "compose" as const, service: "api" };
    const fingerprint = () => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec));
    try {
      await writeFile(path.join(root, "base.yaml"), "services:\n  base:\n    image: busybox\n    environment:\n      WORK_DIR: '${HOME}'\n");
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n    environment: [WORK_DIR=fixed]\n");
      await expect(fingerprint()).resolves.toMatch(/^[a-f0-9]{64}$/);
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    extends:\n      file: base.yaml\n      service: base\n");
      await expect(fingerprint()).rejects.toThrow(/inherited host value/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("resolves an include path list from its first project directory and its scoped env file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-include-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret }));
    try {
      await writeFile(path.join(root, "scope.env"), "SERVICE_ENV=service.env\n");
      await writeFile(path.join(root, "service.env"), "MODE=one\n");
      await writeFile(path.join(root, "compose.yaml"), "include:\n  - path: [first.yaml, second.yaml]\n    env_file: scope.env\n");
      await writeFile(path.join(root, "first.yaml"), "services:\n  api:\n    image: busybox\n    environment:\n      - CUSTOM=${CUSTOM}\n      - SESSION_VALUE=prefix-${CUSTOM}\n");
      await writeFile(path.join(root, "second.yaml"), "services:\n  api:\n    env_file: '${SERVICE_ENV}'\n");
      const first = await fingerprint("10");
      expect(await fingerprint("20")).toBe(first);
      await writeFile(path.join(root, "service.env"), "MODE=two\n");
      expect(await fingerprint("10")).not.toBe(first);
      await writeFile(path.join(root, "second.yaml"), "services:\n  api:\n    env_file: '${SERVICE_ENV}'\n    environment: [SESSION_VALUE=fixed]\n");
      const overridden = await fingerprint("10");
      await writeFile(path.join(root, "first.yaml"), "services:\n  api:\n    image: busybox\n    environment:\n      - CUSTOM=${CUSTOM}\n      - SESSION_VALUE=ignored-${CUSTOM}\n");
      expect(await fingerprint("10")).toBe(overridden);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});
