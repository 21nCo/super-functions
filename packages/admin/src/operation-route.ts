import type { AdminOperationDefinition } from "./types.js";

const SUPPORTED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export interface ParsedAdminOperationRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}

export function parseAdminOperationRoute(operation: AdminOperationDefinition): ParsedAdminOperationRoute | undefined {
  const rawMethod = typeof operation.route === "string"
    ? operation.route.trim().split(/\s+/, 1)[0]
    : operation.route.method;
  const path = typeof operation.route === "string"
    ? operation.route.trim().slice(rawMethod?.length ?? 0).trimStart()
    : operation.route.path;
  const method = rawMethod?.toUpperCase();
  if (!method || !SUPPORTED_METHODS.has(method) || !path) return undefined;
  return { method: method as ParsedAdminOperationRoute["method"], path };
}
