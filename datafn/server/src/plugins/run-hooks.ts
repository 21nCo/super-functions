/**
 * Plugin hook runner
 * Executes DatafnPlugin hooks in deterministic order with fail-open/closed semantics
 */

import type { DatafnPlugin } from "@datafn/core";

/**
 * Error shape for plugin hook failures
 */
export interface PluginError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Filter plugins by runsOn environment
 * Only plugins with "server" in runsOn array should execute on server
 */
function shouldRunOnServer(plugin: DatafnPlugin): boolean {
  return plugin.runsOn.includes("server");
}

/**
 * Run beforeQuery hooks in registration order (fail-closed)
 * If any hook throws or returns an error, execution stops and error is returned
 */
export async function runBeforeQuery(
  query: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<{ ok: true; query: unknown } | { ok: false; error: PluginError }> {
  let currentQuery = query;

  // Filter plugins to only those that run on server
  const serverPlugins = plugins.filter(shouldRunOnServer);

  for (const plugin of serverPlugins) {
    if (!plugin.beforeQuery) continue;

    try {
      const hookCtx = { env: "server" as const, schema: ctx.schema };
      const result = await plugin.beforeQuery(hookCtx, currentQuery);
      currentQuery = result !== undefined ? result : currentQuery;
    } catch (error: any) {
      // beforeQuery failures are fail-closed
      return {
        ok: false,
        error: {
          code: error.code || "INTERNAL",
          message: error.message || "Plugin error",
          details: error.details || { path: "$" },
        },
      };
    }
  }

  return { ok: true, query: currentQuery };
}

/**
 * Run afterQuery hooks in registration order (fail-open)
 * Hooks run but errors don't stop execution - original result is returned
 */
export async function runAfterQuery(
  query: unknown,
  result: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<unknown> {
  let currentResult = result;

  // Filter plugins to only those that run on server
  const serverPlugins = plugins.filter(shouldRunOnServer);

  for (const plugin of serverPlugins) {
    if (!plugin.afterQuery) continue;

    try {
      const hookCtx = { env: "server" as const, schema: ctx.schema };
      const transformed = await plugin.afterQuery(
        hookCtx,
        query,
        currentResult,
      );
      currentResult = transformed !== undefined ? transformed : currentResult;
    } catch (error) {
      // afterQuery failures are fail-open - log but continue
      console.error("afterQuery hook error:", error);
    }
  }

  return currentResult;
}

/**
 * Run beforeMutation hooks in registration order (fail-closed)
 */
export async function runBeforeMutation(
  mutation: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<
  { ok: true; mutation: unknown } | { ok: false; error: PluginError }
> {
  let currentMutation = mutation;

  // Filter plugins to only those that run on server
  const serverPlugins = plugins.filter(shouldRunOnServer);

  for (const plugin of serverPlugins) {
    if (!plugin.beforeMutation) continue;

    try {
      const hookCtx = { env: "server" as const, schema: ctx.schema };
      const result = await plugin.beforeMutation(hookCtx, currentMutation);
      currentMutation = result !== undefined ? result : currentMutation;
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: error.code || "INTERNAL",
          message: error.message || "Plugin error",
          details: error.details || { path: "$" },
        },
      };
    }
  }

  return { ok: true, mutation: currentMutation };
}

/**
 * Run afterMutation hooks in registration order (fail-open)
 */
export async function runAfterMutation(
  mutation: unknown,
  result: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<void> {
  // Filter plugins to only those that run on server
  const serverPlugins = plugins.filter(shouldRunOnServer);

  for (const plugin of serverPlugins) {
    if (!plugin.afterMutation) continue;

    try {
      const hookCtx = { env: "server" as const, schema: ctx.schema };
      await plugin.afterMutation(hookCtx, mutation, result);
    } catch (error) {
      console.error("afterMutation hook error:", error);
    }
  }
}

/**
 * Run beforeSync hooks in registration order (fail-closed)
 */
export async function runBeforeSync(
  phase: "seed" | "clone" | "pull" | "push",
  payload: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<{ ok: true; payload: unknown } | { ok: false; error: PluginError }> {
  let currentPayload = payload;

  // Filter plugins to only those that run on server
  const serverPlugins = plugins.filter(shouldRunOnServer);

  for (const plugin of serverPlugins) {
    if (!plugin.beforeSync) continue;

    try {
      const hookCtx = { env: "server" as const, schema: ctx.schema };
      const result = await plugin.beforeSync(hookCtx, phase, currentPayload);
      currentPayload = result !== undefined ? result : currentPayload;
    } catch (error: any) {
      return {
        ok: false,
        error: {
          code: error.code || "INTERNAL",
          message: error.message || "Plugin error",
          details: error.details || { path: "$" },
        },
      };
    }
  }

  return { ok: true, payload: currentPayload };
}

/**
 * Run afterSync hooks in registration order (fail-open)
 */
export async function runAfterSync(
  phase: "seed" | "clone" | "pull" | "push",
  payload: unknown,
  result: unknown,
  ctx: { plugins: DatafnPlugin[]; schema: any },
  plugins: DatafnPlugin[],
): Promise<void> {
  // Filter plugins to only those that run on server
  const serverPlugins = plugins.filter(shouldRunOnServer);

  for (const plugin of serverPlugins) {
    if (!plugin.afterSync) continue;

    try {
      const hookCtx = { env: "server" as const, schema: ctx.schema };
      await plugin.afterSync(hookCtx, phase, payload, result);
    } catch (error) {
      console.error("afterSync hook error:", error);
    }
  }
}

/**
 * Check if a searchfn plugin is installed (server-only)
 */
export function hasSearchPlugin(plugins: DatafnPlugin[]): boolean {
  return plugins.filter(shouldRunOnServer).some((p) => p.name === "searchfn");
}
