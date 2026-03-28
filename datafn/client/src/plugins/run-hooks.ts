/**
 * Plugin hook runner for client-side plugins
 * Delegates to shared @datafn/core hook runner with env: "client"
 */

import type { DatafnPlugin, DatafnHookContext, DatafnSchema } from "@datafn/core";
import { runBeforeHook, runAfterHook } from "@datafn/core";

export async function runBeforeQuery(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  query: unknown,
): Promise<unknown> {
  const ctx: DatafnHookContext = { env: "client", schema };
  const result = await runBeforeHook(plugins, "client", "beforeQuery", ctx, query);
  if (!result.ok) throw result.error;
  return result.value;
}

export async function runAfterQuery(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  query: unknown,
  queryResult: unknown,
): Promise<unknown> {
  const ctx: DatafnHookContext = { env: "client", schema };
  await runAfterHook(plugins, "client", "afterQuery", ctx, query, queryResult);
  return queryResult;
}

export async function runBeforeMutation(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  mutation: unknown,
): Promise<unknown> {
  const ctx: DatafnHookContext = { env: "client", schema };
  const result = await runBeforeHook(plugins, "client", "beforeMutation", ctx, mutation);
  if (!result.ok) throw result.error;
  return result.value;
}

export async function runAfterMutation(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  mutation: unknown,
  mutationResult: unknown,
): Promise<unknown> {
  const ctx: DatafnHookContext = { env: "client", schema };
  await runAfterHook(plugins, "client", "afterMutation", ctx, mutation, mutationResult);
  return mutationResult;
}

export async function runBeforeSync(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  phase: "seed" | "clone" | "pull" | "push" | "cloneUp" | "reconcile",
  payload: unknown,
): Promise<unknown> {
  const ctx: DatafnHookContext = { env: "client", schema };
  // beforeSync signature: (ctx, phase, payload) — phase is a pre-arg
  const result = await runBeforeHook(plugins, "client", "beforeSync", ctx, payload, [phase]);
  if (!result.ok) throw result.error;
  return result.value;
}

export async function runAfterSync(
  plugins: DatafnPlugin[],
  schema: DatafnSchema,
  phase: "seed" | "clone" | "pull" | "push" | "cloneUp" | "reconcile",
  payload: unknown,
  syncResult: unknown,
): Promise<unknown> {
  const ctx: DatafnHookContext = { env: "client", schema };
  // afterSync signature: (ctx, phase, payload, result) — phase is a pre-arg
  await runAfterHook(plugins, "client", "afterSync", ctx, payload, syncResult, [phase]);
  return syncResult;
}
