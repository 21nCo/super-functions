import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createComposeEnvironment, fingerprintComposeSource } from "../src/index.js";

const live = process.env.DEVFN_REAL_COMPOSE === "1";

describe.skipIf(!live)("effective Compose startup fingerprint", () => {
  it("rejects an oversized extends traversal before running Compose", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devfn-fingerprint-extends-"));
    const spec = { adapter: "compose" as const, service: "api" };
    const services = ["  api:\n    extends: step0"];
    for (let index = 0; index < 520; index += 1) {
      services.push(`  step${index}:\n    ${index === 519 ? "image: busybox" : `extends: step${index + 1}`}`);
    }
    try {
      await writeFile(path.join(root, "compose.yaml"), `services:\n${services.join("\n")}\n`);
      await expect(fingerprintComposeSource(spec, root, "owner", createComposeEnvironment(spec))).rejects.toThrow(/inventory Compose sources/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 10_000);

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
