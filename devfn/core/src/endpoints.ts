import { validateDevFnConfig, type DevFnConfig } from "@devfn/config";

import { DevFnError, type LifecyclePlan } from "./types.js";

export interface EndpointResolutionInput {
  config: DevFnConfig;
  plan: LifecyclePlan;
  /** Opaque lifecycle owner. Callers may choose more than one owner per checkout. */
  ownerId: string;
  ports: Readonly<Record<string, number>>;
}

export interface ResolvedNodeStartup {
  environment: Record<string, string>;
  command?: string[];
}

export interface EndpointResolution {
  ownerId: string;
  /** Generated values take precedence over all manifest literals. */
  generated: Record<string, string>;
  /** Non-secret values suitable for owner-only environment outputs. */
  environment: Record<string, string>;
  /** Direct loopback URLs available before proxy route installation. */
  directUrls: Record<string, string>;
  nodes: Record<string, ResolvedNodeStartup>;
}

const REFERENCE = /\{\{env\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

function invalid(field: string, message: string): never {
  throw new DevFnError("DEVFN_RUNTIME_INVALID", `${field}: ${message}`);
}

function resolveValues(values: Record<string, string>, protectedValues: Readonly<Record<string, string>>, field: string): Record<string, string> {
  const resolved: Record<string, string> = Object.assign(Object.create(null), protectedValues);
  const visiting = new Set<string>();
  const visit = (key: string): string => {
    if (Object.prototype.hasOwnProperty.call(resolved, key)) return resolved[key];
    if (!Object.prototype.hasOwnProperty.call(values, key)) invalid(field, `missing reference ${key}.`);
    if (visiting.has(key)) invalid(field, `cyclic reference containing ${key}.`);
    visiting.add(key);
    const value = expand(values[key], `${field}.${key}`, visit);
    visiting.delete(key);
    resolved[key] = value;
    return value;
  };
  for (const key of Object.keys(values)) visit(key);
  return resolved;
}

function expand(value: string, field: string, lookup: (name: string) => string): string {
  const expanded = value.replace(REFERENCE, (_match, key: string) => lookup(key));
  if (expanded.includes("{{") || expanded.includes("}}")) invalid(field, "malformed template reference.");
  if (expanded.includes("\0")) invalid(field, "NUL is not a valid environment or argv value.");
  return expanded;
}

function normalized(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Resolve one selected profile before launch; no process, lease, or filesystem mutation occurs here. */
export function resolveEndpointTemplates(input: EndpointResolutionInput): EndpointResolution {
  const { plan, ownerId, ports } = input;
  const config = validateDevFnConfig(input.config);
  if (!ownerId || ownerId.includes("\0")) invalid("ownerId", "must be a non-empty opaque value without NUL.");
  const profile = config.profiles[plan.profile];
  if (!profile) invalid("profile", `unknown profile ${plan.profile}.`);
  const generated: Record<string, string> = {
    DEVFN_PROJECT_ID: config.project.id,
    DEVFN_INSTANCE_ID: ownerId,
    DEVFN_PROFILE: plan.profile,
  };
  const directUrls: Record<string, string> = Object.create(null);
  const httpPorts = new Set<string>();
  for (const node of plan.nodes) {
    const health = node.kind === "process" ? config.processes?.[node.name]?.health : config.services?.[node.name]?.health;
    if (health?.type === "http" && health.port) httpPorts.add(health.port);
  }
  if (plan.proxy) for (const hostname of Object.values(config.hostnames ?? {})) {
    if (!hostname.profiles || hostname.profiles.includes(plan.profile)) httpPorts.add(hostname.target);
  }
  for (const name of plan.portNames) {
    const port = ports[name];
    if (!Number.isInteger(port) || port < 1 || port > 65535) invalid(`ports.${name}`, "requires a leased port between 1 and 65535.");
    generated[`DEVFN_PORT_${normalized(name)}`] = String(port);
    const alias = config.ports?.[name]?.env;
    if (alias) generated[alias] = String(port);
    if (httpPorts.has(name) && config.ports?.[name]?.protocol !== "udp") {
      const url = `http://127.0.0.1:${port}`;
      directUrls[name] = url;
      generated[`DEVFN_URL_${normalized(name)}`] = url;
    }
  }
  const environment = resolveValues(profile.environment ?? {}, generated, `profiles.${plan.profile}.environment`);
  const nodes: Record<string, ResolvedNodeStartup> = Object.create(null);
  for (const node of plan.nodes) {
    const spec = node.kind === "process" ? config.processes?.[node.name] : config.services?.[node.name];
    if (!spec) invalid(`nodes.${node.name}`, "selected node is missing.");
    const nodeEnvironment = resolveValues({ ...environment, ...(spec.env ?? {}) }, generated, `${node.kind === "process" ? "processes" : "services"}.${node.name}.env`);
    const lookup = (key: string): string => {
      if (!Object.prototype.hasOwnProperty.call(nodeEnvironment, key)) invalid(`processes.${node.name}.command`, `missing reference ${key}.`);
      return nodeEnvironment[key];
    };
    const command = node.kind === "process" ? config.processes![node.name].command?.map((item, index) => {
      const value = expand(item, `processes.${node.name}.command[${index}]`, lookup);
      if (value.length === 0) invalid(`processes.${node.name}.command[${index}]`, "argv value cannot be empty.");
      return value;
    }) : undefined;
    nodes[node.name] = { environment: nodeEnvironment, ...(command ? { command } : {}) };
  }
  return { ownerId, generated, environment, directUrls, nodes };
}
