import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DevFnConfig, EnvironmentOutput } from "@devfn/config";
import type { LifecycleReceipt } from "./types.js";

export function runtimeDirectory(config: DevFnConfig, root: string, instanceId: string): string {
  return path.join(root, config.runtimeDir ?? ".devfn", "instances", instanceId);
}

export function receiptPath(config: DevFnConfig, root: string, instanceId: string): string {
  return path.join(runtimeDirectory(config, root, instanceId), "receipt.json");
}

export async function readReceipt(config: DevFnConfig, root: string, instanceId: string): Promise<LifecycleReceipt | null> {
  try { const value = JSON.parse(await readFile(receiptPath(config, root, instanceId), "utf8")) as LifecycleReceipt; return value.version === 1 ? value : null; }
  catch { return null; }
}

export async function writeReceipt(receipt: LifecycleReceipt): Promise<void> {
  await mkdir(receipt.runtimeDir, { recursive: true, mode: 0o700 });
  const target = path.join(receipt.runtimeDir, "receipt.json");
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, target);
}

function dotenv(value: string): string { return /^[A-Za-z0-9_./:@-]*$/.test(value) ? value : JSON.stringify(value); }

export async function writeEnvironmentOutputs(root: string, runtimeDir: string, outputs: readonly EnvironmentOutput[], environment: Record<string, string>): Promise<string[]> {
  const effective = outputs.length ? outputs : [{ path: path.relative(root, path.join(runtimeDir, "runtime.env")), format: "dotenv" as const, mode: 0o600 }];
  const written: string[] = [];
  for (const output of effective) {
    const target = path.resolve(root, output.path);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Environment output escapes project root: ${output.path}`);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const content = output.format === "json" ? `${JSON.stringify(environment, null, 2)}\n` : `${Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${dotenv(value)}`).join("\n")}\n`;
    await writeFile(target, content, { encoding: "utf8", mode: output.mode ?? 0o600 });
    written.push(target);
  }
  return written;
}
