import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveContainedPath, type DevFnConfig, type EnvironmentOutput } from "@devfn/config";
import type { LifecycleReceipt } from "./types.js";

export function runtimeDirectory(config: DevFnConfig, root: string, instanceId: string): string {
  return path.join(root, config.runtimeDir ?? ".devfn", "instances", instanceId);
}

export async function secureRuntimeDirectory(config: DevFnConfig, root: string, instanceId: string): Promise<string> {
  return await resolveContainedPath(root, path.join(config.runtimeDir ?? ".devfn", "instances", instanceId), "runtimeDir");
}

export function receiptPath(config: DevFnConfig, root: string, instanceId: string): string {
  return path.join(runtimeDirectory(config, root, instanceId), "receipt.json");
}

function stableReceiptPath(root: string, instanceId: string): string {
  return path.join(root, ".devfn", "receipts", `${instanceId}.json`);
}

export async function readReceipt(config: DevFnConfig, root: string, instanceId: string): Promise<LifecycleReceipt | null> {
  const configuredDirectory = await secureRuntimeDirectory(config, root, instanceId).catch(() => undefined);
  for (const candidate of [stableReceiptPath(root, instanceId), ...(configuredDirectory ? [path.join(configuredDirectory, "receipt.json")] : [])]) {
    try {
      const value = JSON.parse(await readFile(candidate, "utf8")) as LifecycleReceipt;
      const [canonicalRoot, receiptRoot, canonicalRuntime] = await Promise.all([realpath(root), realpath(value.root), realpath(value.runtimeDir)]);
      const relativeRuntime = path.relative(canonicalRoot, canonicalRuntime);
      if (value.version === 1 && value.instanceId === instanceId && receiptRoot === canonicalRoot && relativeRuntime !== "" && !relativeRuntime.startsWith(`..${path.sep}`) && relativeRuntime !== ".." && !path.isAbsolute(relativeRuntime)) return value;
    } catch { /* Try the configured legacy receipt next. */ }
  }
  return null;
}

async function writeAtomicReceipt(target: string, receipt: LifecycleReceipt): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, target);
}

export async function writeReceipt(receipt: LifecycleReceipt): Promise<void> {
  const runtimeTarget = path.join(receipt.runtimeDir, "receipt.json");
  await writeAtomicReceipt(runtimeTarget, receipt);
  const stableTarget = stableReceiptPath(receipt.root, receipt.instanceId);
  if (stableTarget !== runtimeTarget) await writeAtomicReceipt(stableTarget, receipt);
}

function dotenv(value: string): string { return /^[A-Za-z0-9_./:@-]*$/.test(value) ? value : JSON.stringify(value); }

export async function writeEnvironmentOutputs(root: string, runtimeDir: string, outputs: readonly EnvironmentOutput[], environment: Record<string, string>): Promise<string[]> {
  const effective = outputs.length
    ? await Promise.all(outputs.map(async (output) => ({ output, target: await resolveContainedPath(root, output.path, "environmentOutputs.path") })))
    : [{ output: { path: "runtime.env", format: "dotenv" as const, mode: 0o600 }, target: path.join(runtimeDir, "runtime.env") }];
  const written: string[] = [];
  for (const { output, target } of effective) {
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const content = output.format === "json" ? `${JSON.stringify(environment, null, 2)}\n` : `${Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${dotenv(value)}`).join("\n")}\n`;
    await writeFile(target, content, { encoding: "utf8", mode: output.mode ?? 0o600 });
    await chmod(target, output.mode ?? 0o600);
    written.push(target);
  }
  return written;
}
