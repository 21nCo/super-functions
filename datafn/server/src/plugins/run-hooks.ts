/**
 * Plugin hook runner for server-side plugins
 * Delegates to shared @datafn/core hook runner with env: "server"
 */

import type { DatafnPlugin, DatafnHookContext, HookError } from "../core-types.js";
import { runBeforeHook, runAfterHook } from "@datafn/core";
import type { DatafnLogger } from "../logger.js";

export type { HookError };

export async function runBeforeQuery(
  query: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<{ ok: true; query: unknown } | { ok: false; error: HookError }> {
  const hookCtx: DatafnHookContext = { env: "server", schema: ctx.schema };
  const result = await runBeforeHook(plugins, "server", "beforeQuery", hookCtx, query);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, query: result.value };
}

export async function runAfterQuery(
  query: unknown,
  result: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
  logger?: DatafnLogger,
): Promise<unknown> {
  // LOW-006: Capture return value from afterQuery hooks so plugins can transform/redact results.
  // runAfterHook ignores return values; we implement the loop inline to capture them.
  const hookCtx: DatafnHookContext = { env: "server", schema: ctx.schema };
  let current = result;
  const filtered = plugins.filter((p) => p.runsOn.includes("server"));
  for (const plugin of filtered) {
    const hook = plugin.afterQuery as ((ctx: DatafnHookContext, query: unknown, result: unknown) => Promise<unknown> | unknown) | undefined;
    if (!hook) continue;
    try {
      const returned = await hook(hookCtx, query, current);
      if (returned !== undefined) current = returned;
    } catch (err) {
      logger?.error("Plugin afterQuery error", { plugin: plugin.name, error: String(err), operation: "plugin" });
    }
  }
  return current;
}

export async function runBeforeMutation(
  mutation: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<{ ok: true; mutation: unknown } | { ok: false; error: HookError }> {
  const hookCtx: DatafnHookContext = { env: "server", schema: ctx.schema };
  const result = await runBeforeHook(plugins, "server", "beforeMutation", hookCtx, mutation);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, mutation: result.value };
}

export async function runAfterMutation(
  mutation: unknown,
  result: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<void> {
  const hookCtx: DatafnHookContext = { env: "server", schema: ctx.schema };
  await runAfterHook(plugins, "server", "afterMutation", hookCtx, mutation, result);
}

export async function runBeforeSync(
  phase: "seed" | "clone" | "pull" | "push" | "reconcile",
  payload: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<{ ok: true; payload: unknown } | { ok: false; error: HookError }> {
  const hookCtx: DatafnHookContext = { env: "server", schema: ctx.schema };
  const result = await runBeforeHook(plugins, "server", "beforeSync", hookCtx, payload, [phase]);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, payload: result.value };
}

export async function runAfterSync(
  phase: "seed" | "clone" | "pull" | "push" | "reconcile",
  payload: unknown,
  result: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<void> {
  const hookCtx: DatafnHookContext = { env: "server", schema: ctx.schema };
  await runAfterHook(plugins, "server", "afterSync", hookCtx, payload, result, [phase]);
}
