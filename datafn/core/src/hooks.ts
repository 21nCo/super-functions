/**
 * Generic plugin hook runner (HKS-001)
 * Fail-closed for before hooks, fail-open for after hooks.
 */

import type { DatafnPlugin, DatafnHookContext } from "./types.js";

export interface HookError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type BeforeHookResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HookError };

type AfterHookName = "afterQuery" | "afterMutation" | "afterSync";

function wrapError(err: unknown, pluginName: string, hookName: string): HookError {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      code: (e.code as string) || "INTERNAL",
      message: (e.message as string) || "Plugin error",
      details: { path: `plugins.${pluginName}.${hookName}`, ...((e.details as Record<string, unknown>) ?? {}) },
    };
  }
  return {
    code: "INTERNAL",
    message: String(err),
    details: { path: `plugins.${pluginName}.${hookName}` },
  };
}

/**
 * Run a before-style hook across plugins filtered by env.
 * Fail-closed: first error stops the chain and returns { ok: false, error }.
 * Each hook's return value (if defined) becomes the new payload.
 *
 * @param preArgs Optional args inserted before payload in hook call: hook(ctx, ...preArgs, payload)
 */
export async function runBeforeHook<T = unknown>(
  plugins: DatafnPlugin[],
  env: "client" | "server",
  hookName: keyof DatafnPlugin,
  ctx: DatafnHookContext,
  payload: T,
  preArgs: unknown[] = [],
): Promise<BeforeHookResult<T>> {
  let current = payload;
  const filtered = plugins.filter((p) => p.runsOn.includes(env));

  for (const plugin of filtered) {
    const hook = plugin[hookName] as ((...args: unknown[]) => Promise<unknown> | unknown) | undefined;
    if (!hook) continue;

    try {
      const result = await hook(ctx, ...preArgs, current);
      if (result !== undefined) current = result as T;
    } catch (err) {
      return { ok: false, error: wrapError(err, plugin.name, String(hookName)) };
    }
  }

  return { ok: true, value: current };
}

/**
 * Run an after-style hook across plugins filtered by env.
 * Fail-open: errors are logged but do not stop the chain.
 *
 * @param preArgs Optional args inserted before payload in hook call: hook(ctx, ...preArgs, payload, result)
 */
export async function runAfterHook(
  plugins: DatafnPlugin[],
  env: "client" | "server",
  hookName: AfterHookName,
  ctx: DatafnHookContext,
  payload: unknown,
  result: unknown,
  preArgs: unknown[] = [],
): Promise<unknown> {
  const filtered = plugins.filter((p) => p.runsOn.includes(env));
  let currentResult = result;

  for (const plugin of filtered) {
    const hook = plugin[hookName] as ((...args: unknown[]) => Promise<unknown> | unknown) | undefined;
    if (!hook) continue;

    try {
      const nextResult = await hook(ctx, ...preArgs, payload, currentResult);
      if (nextResult !== undefined) {
        currentResult = nextResult;
      }
    } catch (err) {
      console.error(`Plugin ${plugin.name}.${String(hookName)} error:`, err);
    }
  }

  return currentResult;
}
