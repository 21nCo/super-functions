/**
 * Plugin hook runner for client-side plugins
 * Implements CLIENT-PLUG-001: registration order, runsOn enforcement, fail semantics
 */

import type {
  DatafnPlugin,
  DatafnHookContext,
  DatafnSchema,
} from "@datafn/core";

/**
 * Filter plugins to only those that run on client
 */
export function getClientPlugins(plugins: DatafnPlugin[]): DatafnPlugin[] {
  return plugins.filter((p) => p.runsOn && p.runsOn.includes("client"));
}

/**
 * Run beforeQuery hooks (fail-closed)
 * Throws deterministic error if any hook fails
 */
export async function runBeforeQuery(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  query: unknown,
): Promise<unknown> {
  let transformed = query;
  const ctx: DatafnHookContext = { env: "client", schema };

  for (const plugin of getClientPlugins(plugins)) {
    if (plugin.beforeQuery) {
      try {
        const result = await plugin.beforeQuery(ctx, transformed);
        if (result !== undefined) {
          transformed = result;
        }
      } catch (error: any) {
        // Fail-closed: throw with deterministic path
        throw {
          code: error.code || "INTERNAL",
          message: error.message || "Plugin error",
          details: {
            path: `plugins.${plugin.name}.beforeQuery`,
            ...(error.details || {}),
          },
        };
      }
    }
  }

  return transformed;
}

/**
 * Run afterQuery hooks (fail-open)
 * Logs errors but continues execution
 */
export async function runAfterQuery(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  query: unknown,
  result: unknown,
): Promise<unknown> {
  let transformed = result;
  const ctx: DatafnHookContext = { env: "client", schema };

  for (const plugin of getClientPlugins(plugins)) {
    if (plugin.afterQuery) {
      try {
        const pluginResult = await plugin.afterQuery(ctx, query, transformed);
        if (pluginResult !== undefined) {
          transformed = pluginResult;
        }
      } catch (error) {
        // Fail-open: log but continue
        console.error(`Plugin ${plugin.name}.afterQuery failed:`, error);
      }
    }
  }

  return transformed;
}

/**
 * Run beforeMutation hooks (fail-closed)
 */
export async function runBeforeMutation(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  mutation: unknown,
): Promise<unknown> {
  let transformed = mutation;
  const ctx: DatafnHookContext = { env: "client", schema };

  for (const plugin of getClientPlugins(plugins)) {
    if (plugin.beforeMutation) {
      try {
        const result = await plugin.beforeMutation(ctx, transformed);
        if (result !== undefined) {
          transformed = result;
        }
      } catch (error: any) {
        throw {
          code: error.code || "INTERNAL",
          message: error.message || "Plugin error",
          details: {
            path: `plugins.${plugin.name}.beforeMutation`,
            ...(error.details || {}),
          },
        };
      }
    }
  }

  return transformed;
}

/**
 * Run afterMutation hooks (fail-open)
 */
export async function runAfterMutation(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  mutation: unknown,
  result: unknown,
): Promise<unknown> {
  let transformed = result;
  const ctx: DatafnHookContext = { env: "client", schema };

  for (const plugin of getClientPlugins(plugins)) {
    if (plugin.afterMutation) {
      try {
        await plugin.afterMutation(ctx, mutation, transformed);
        // afterMutation returns void, no transformation
      } catch (error) {
        console.error(`Plugin ${plugin.name}.afterMutation failed:`, error);
      }
    }
  }

  return transformed;
}

/**
 * Run beforeSync hooks (fail-closed)
 */
export async function runBeforeSync(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  phase: "seed" | "clone" | "pull" | "push",
  payload: unknown,
): Promise<unknown> {
  let transformed = payload;
  const ctx: DatafnHookContext = { env: "client", schema };

  for (const plugin of getClientPlugins(plugins)) {
    if (plugin.beforeSync) {
      try {
        const result = await plugin.beforeSync(ctx, phase, transformed);
        if (result !== undefined) {
          transformed = result;
        }
      } catch (error: any) {
        throw {
          code: error.code || "INTERNAL",
          message: error.message || "Plugin error",
          details: {
            path: `plugins.${plugin.name}.beforeSync`,
            ...(error.details || {}),
          },
        };
      }
    }
  }

  return transformed;
}

/**
 * Run afterSync hooks (fail-open)
 */
export async function runAfterSync(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  phase: "seed" | "clone" | "pull" | "push",
  payload: unknown,
  result: unknown,
): Promise<unknown> {
  let transformed = result;
  const ctx: DatafnHookContext = { env: "client", schema };

  for (const plugin of getClientPlugins(plugins)) {
    if (plugin.afterSync) {
      try {
        await plugin.afterSync(ctx, phase, payload, transformed);
        // afterSync returns void, no transformation
      } catch (error) {
        console.error(`Plugin ${plugin.name}.afterSync failed:`, error);
      }
    }
  }

  return transformed;
}
