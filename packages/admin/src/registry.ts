import { AdminError } from "./errors.js";
import { assertAdminCapabilityManifest } from "./validator.js";
import { parseAdminOperationRoute } from "./operation-route.js";
import type {
  AdminCapabilityAdapter,
  AdminCapabilityManifest,
  AdminNavigationDefinition,
  AdminOperationDefinition,
} from "./types.js";

export interface AdminRegistryOperation {
  moduleId: string;
  manifest: AdminCapabilityManifest;
  adapter: AdminCapabilityAdapter;
  operation: AdminOperationDefinition;
  routePath: string;
  mcpToolName: string;
}

export interface CreateAdminRegistryOptions {
  adapters: readonly AdminCapabilityAdapter[];
  /** Explicit allowlist. `[]` is a valid shell-only installation; omission is rejected. */
  enabledModules: readonly string[];
  apiBasePath?: string;
}

function dependenciesOf(manifest: AdminCapabilityManifest): string[] {
  const dependencies = (manifest.dependencies ?? []).flatMap((dependency) => {
    if (typeof dependency === "string") return [dependency];
    return dependency.required === false ? [] : [dependency.moduleId];
  });
  if (manifest.owner) dependencies.push(manifest.owner.moduleId);
  return [...new Set(dependencies)];
}

export function adminMcpToolName(operationId: string): string {
  let normalized = "";
  let separator = false;
  for (const character of operationId) {
    const code = character.charCodeAt(0);
    const alphaNumeric = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (alphaNumeric) {
      if (separator && normalized) normalized += "_";
      normalized += character;
      separator = false;
    } else {
      separator = true;
    }
  }
  return `superconsole_${normalized}`.toLowerCase();
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 47) start += 1;
  while (end > start && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(start, end);
}

function effectiveAdminMcpToolName(operation: AdminOperationDefinition): string {
  return typeof operation.mcp === "object" && operation.mcp.name
    ? operation.mcp.name
    : adminMcpToolName(operation.id);
}

export class AdminCapabilityRegistry {
  readonly apiBasePath: string;
  readonly manifests: readonly AdminCapabilityManifest[];
  readonly operations: readonly AdminRegistryOperation[];
  readonly enabledModuleIds: readonly string[];
  readonly navigation: readonly { moduleId: string; ownerModuleId?: string; item: AdminNavigationDefinition }[];
  private readonly adaptersById: ReadonlyMap<string, AdminCapabilityAdapter>;
  private readonly operationsById: ReadonlyMap<string, AdminRegistryOperation>;
  private readonly operationsByRoute: ReadonlyMap<string, AdminRegistryOperation>;
  private readonly operationsByTool: ReadonlyMap<string, AdminRegistryOperation>;

  constructor(options: CreateAdminRegistryOptions) {
    const configuredBasePath = options.apiBasePath ?? "/api/admin/v1";
    if (
      typeof configuredBasePath !== "string" ||
      !configuredBasePath.startsWith("/") ||
      configuredBasePath.startsWith("//") ||
      configuredBasePath.includes("\\") ||
      configuredBasePath.includes("//") ||
      /[?#\s\u0000-\u001f\u007f]/.test(configuredBasePath) ||
      /(^|\/)\.{1,2}(\/|$)/.test(configuredBasePath)
    ) {
      throw new AdminError("invalid_argument", "Admin registry apiBasePath must be a canonical internal absolute path.");
    }
    const basePath = `/${trimSlashes(configuredBasePath)}`;
    const supplied = new Map<string, AdminCapabilityAdapter>();
    for (const adapter of options.adapters) {
      assertAdminCapabilityManifest(adapter.manifest);
      if (supplied.has(adapter.manifest.id)) throw new AdminError("conflict", `Duplicate admin module: ${adapter.manifest.id}.`);
      const declared = new Set(adapter.manifest.operations.map((operation) => operation.id));
      const registered = Object.keys(adapter.handlers);
      const missing = [...declared].filter((operationId) => typeof adapter.handlers[operationId] !== "function");
      const unknown = registered.filter((operationId) => !declared.has(operationId));
      if (missing.length || unknown.length) {
        throw new AdminError("invalid_argument", `Admin module ${adapter.manifest.id} must register exact handler coverage.`, {
          details: { moduleId: adapter.manifest.id, missing, unknown },
        });
      }
      supplied.set(adapter.manifest.id, adapter);
    }

    if (!Array.isArray(options.enabledModules)) {
      throw new AdminError("invalid_argument", "Admin registry requires an explicit enabledModules allowlist.");
    }
    const requested = [...new Set(options.enabledModules)];
    for (const moduleId of requested) {
      const adapter = supplied.get(moduleId);
      if (!adapter) throw new AdminError("dependency_unavailable", `Enabled admin module is not registered: ${moduleId}.`);
      if (adapter.manifest.availability === "unavailable") {
        throw new AdminError("dependency_unavailable", `Admin module ${moduleId} is not domain-backed and cannot be enabled.`, {
          details: { moduleId, reason: adapter.manifest.unavailableReason },
        });
      }
      if (adapter.manifest.availability === "folded") {
        throw new AdminError("dependency_unavailable", `Admin module ${moduleId} is folded into ${adapter.manifest.owner?.moduleId ?? "its owner"} and cannot be enabled independently.`, {
          details: { moduleId, ownerModuleId: adapter.manifest.owner?.moduleId },
        });
      }
    }
    const enabled = new Set(requested);
    for (const moduleId of requested) {
      const manifest = supplied.get(moduleId)!.manifest;
      for (const dependency of dependenciesOf(manifest)) {
        if (!enabled.has(dependency)) {
          throw new AdminError("dependency_unavailable", `Admin module ${moduleId} requires enabled module ${dependency}.`, {
            details: { moduleId, dependency },
          });
        }
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: string[] = [];
    const visit = (moduleId: string, path: string[]): void => {
      if (visiting.has(moduleId)) throw new AdminError("conflict", `Admin module dependency cycle: ${[...path, moduleId].join(" -> ")}.`);
      if (visited.has(moduleId)) return;
      visiting.add(moduleId);
      for (const dependency of dependenciesOf(supplied.get(moduleId)!.manifest)) visit(dependency, [...path, moduleId]);
      visiting.delete(moduleId);
      visited.add(moduleId);
      ordered.push(moduleId);
    };
    requested.forEach((moduleId) => visit(moduleId, []));

    const operationIds = new Map<string, AdminRegistryOperation>();
    const routes = new Map<string, AdminRegistryOperation>();
    const tools = new Map<string, AdminRegistryOperation>();
    for (const moduleId of ordered) {
      const adapter = supplied.get(moduleId)!;
      for (const operation of adapter.manifest.operations) {
        const route = parseAdminOperationRoute(operation);
        if (!route) throw new AdminError("invalid_argument", `Invalid route for ${operation.id}.`);
        const suffix = route.path.startsWith("/") ? route.path : `/${route.path}`;
        const routePath = `${basePath}/modules/${moduleId}${suffix}`;
        const routeKey = `${route.method} ${normalizeRoutePattern(routePath)}`;
        const mcpToolName = effectiveAdminMcpToolName(operation);
        const entry: AdminRegistryOperation = { moduleId, manifest: adapter.manifest, adapter, operation, routePath, mcpToolName };
        if (operationIds.has(operation.id)) throw new AdminError("conflict", `Duplicate admin operation ID: ${operation.id}.`);
        if (routes.has(routeKey)) throw new AdminError("conflict", `Duplicate admin route: ${routeKey}.`);
        if (tools.has(mcpToolName)) throw new AdminError("conflict", `Duplicate admin MCP tool: ${mcpToolName}.`);
        operationIds.set(operation.id, entry);
        routes.set(routeKey, entry);
        tools.set(mcpToolName, entry);
      }
    }

    const navigation = ordered.flatMap((moduleId) => {
      const manifest = supplied.get(moduleId)!.manifest;
      const definitions = manifest.navigation ? (Array.isArray(manifest.navigation) ? manifest.navigation : [manifest.navigation]) : [];
      return definitions.map((item) => ({ moduleId, ...(manifest.owner ? { ownerModuleId: manifest.owner.moduleId } : {}), item }));
    }).sort((left, right) => (left.item.order ?? 0) - (right.item.order ?? 0) || left.item.label.localeCompare(right.item.label));

    this.apiBasePath = basePath;
    this.enabledModuleIds = Object.freeze(ordered);
    this.manifests = Object.freeze(ordered.map((moduleId) => supplied.get(moduleId)!.manifest));
    this.operations = Object.freeze([...operationIds.values()]);
    this.navigation = Object.freeze(navigation) as typeof this.navigation;
    this.adaptersById = supplied;
    this.operationsById = operationIds;
    this.operationsByRoute = routes;
    this.operationsByTool = tools;
  }

  hasModule(moduleId: string): boolean { return this.enabledModuleIds.includes(moduleId); }
  getManifest(moduleId: string): AdminCapabilityManifest | undefined {
    return this.hasModule(moduleId) ? this.adaptersById.get(moduleId)?.manifest : undefined;
  }
  requireManifest(moduleId: string): AdminCapabilityManifest {
    const manifest = this.getManifest(moduleId);
    if (!manifest || !this.hasModule(moduleId)) throw new AdminError("not_found", `Admin module is not enabled: ${moduleId}.`);
    return manifest;
  }
  getOperation(operationId: string): AdminRegistryOperation | undefined { return this.operationsById.get(operationId); }
  requireOperation(operationId: string): AdminRegistryOperation {
    const operation = this.getOperation(operationId);
    if (!operation) throw new AdminError("not_found", `Admin operation is not enabled: ${operationId}.`);
    return operation;
  }
  matchRoute(method: string, path: string): AdminRegistryOperation | undefined {
    return this.operationsByRoute.get(`${method.toUpperCase()} ${normalizeRoutePattern(path)}`)
      ?? this.operations.find((entry) => routeMatches(entry.operation, entry.routePath, method, path));
  }
  matchMcpTool(toolName: string): AdminRegistryOperation | undefined { return this.operationsByTool.get(toolName); }
  toJSON(): { schemaVersion: "1.0"; enabledModules: readonly AdminCapabilityManifest[] } {
    return { schemaVersion: "1.0", enabledModules: this.manifests };
  }
}

function normalizeRoutePattern(path: string): string {
  return path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ":param").replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ":param");
}

function routeMatches(operation: AdminOperationDefinition, pattern: string, method: string, path: string): boolean {
  const route = parseAdminOperationRoute(operation);
  if (route?.method !== method.toUpperCase()) return false;
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("?")[0]!.split("/").filter(Boolean);
  return patternParts.length === pathParts.length && patternParts.every((part, index) =>
    part.startsWith(":") || /^\{[^}]+\}$/.test(part) || part === pathParts[index]);
}

export function createAdminRegistry(options: CreateAdminRegistryOptions): AdminCapabilityRegistry {
  return new AdminCapabilityRegistry(options);
}
