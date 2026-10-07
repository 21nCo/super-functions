import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createComposeEnvironment, fingerprintComposeSource } from "../src/index.js";

const live = process.env.DEVFN_REAL_COMPOSE === "1";

describe.skipIf(!live)("effective Compose startup fingerprint", () => {
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

  it("uses env_file interpolation provenance for secret aliases", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-env-alias-"));
    const spec = { adapter: "compose" as const, service: "api", envAllowlist: ["CUSTOM", "FILE_PATH"], secretEnv: ["CUSTOM"] };
    const fingerprint = (secret: string) => fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec, {}, { ...process.env, CUSTOM: secret, FILE_PATH: path.join(root, "service.env") }));
    try {
      await writeFile(path.join(root, "compose.yaml"), "services:\n  api:\n    image: busybox\n    env_file: ${FILE_PATH}\n");
      await writeFile(path.join(root, "service.env"), "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=10\n");
      const first = await fingerprint("10");
      expect(await fingerprint("20")).toBe(first);
      await writeFile(path.join(root, "service.env"), "CUSTOM=${CUSTOM}\nALIAS=prefix-${CUSTOM}\nMODE=11\n");
      expect(await fingerprint("10")).not.toBe(first);
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
