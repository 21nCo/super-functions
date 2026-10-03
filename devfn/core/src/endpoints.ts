import { createHash } from "node:crypto";

import { validateDevFnConfig, type DevFnConfig } from "@devfn/config";
import { resolveHttpReadinessUrl } from "@devfn/processes";

import { DevFnError, type LifecyclePlan } from "./types.js";

export interface EndpointResolutionInput {
  config: DevFnConfig;
  plan: LifecyclePlan;
  /** Opaque lifecycle owner. Callers may choose more than one owner per checkout. */
  ownerId: string;
  ports: Readonly<Record<string, number>>;
  /** Effective policy suffix for selected local proxy hostnames. */
  hostnameSuffix?: string;
}

export interface ResolvedNodeStartup {
  environment: Record<string, string>;
  /** Fully resolved direct HTTP probe, including path and query. */
  healthUrl?: string;
  command?: string[];
  script?: string;
  healthCommand?: string[];
}

export interface EndpointResolution {
  ownerId: string;
  /** Generated values take precedence over all manifest literals. */
  generated: Record<string, string>;
  /** Non-secret values suitable for owner-only environment outputs. */
  environment: Record<string, string>;
  /** Direct loopback URLs available before proxy route installation. */
  directUrls: Record<string, string>;
  /** URLs reachable by sibling services on the same Compose project network. */
  composeUrls: Record<string, string>;
  nodes: Record<string, ResolvedNodeStartup>;
}

const REFERENCE = /\{\{env\.([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

function invalid(field: string, message: string): never {
  throw new DevFnError("DEVFN_RUNTIME_INVALID", `${field}: ${message}`);
}

function resolveValues(values: Record<string, string>, base: Readonly<Record<string, string>>, generated: Readonly<Record<string, string>>, field: string): Record<string, string> {
  const resolved: Record<string, string> = Object.assign(Object.create(null), base);
  const generatedKeys = new Map(Object.keys(generated).map((key) => [key.toUpperCase(), key]));
  const checkedReferences = new Set<string>();
  const activeReferences = new Set<string>();
  const checkReferences = (key: string): void => {
    if (checkedReferences.has(key)) return;
    if (activeReferences.has(key)) invalid(field, `cyclic reference containing ${key}.`);
    activeReferences.add(key);
    for (const match of values[key].matchAll(REFERENCE)) if (Object.prototype.hasOwnProperty.call(values, match[1])) checkReferences(match[1]);
    activeReferences.delete(key);
    checkedReferences.add(key);
  };
  for (const key of Object.keys(values)) checkReferences(key);
  for (const key of Object.keys(values)) {
    const generatedKey = generatedKeys.get(key.toUpperCase());
    if (generatedKey && generatedKey !== key) invalid(`${field}.${key}`, `collides with generated environment key ${generatedKey}.`);
    if (!generatedKey) delete resolved[key];
  }
  const visiting = new Set<string>();
  const checked = new Set<string>();
  const visit = (key: string): string => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      if (Object.prototype.hasOwnProperty.call(resolved, key)) return resolved[key];
      invalid(field, `missing reference ${key}.`);
    }
    if (checked.has(key)) return resolved[key];
    if (visiting.has(key)) invalid(field, `cyclic reference containing ${key}.`);
    visiting.add(key);
    const value = expand(values[key], `${field}.${key}`, (reference) => {
      if (reference === key && Object.prototype.hasOwnProperty.call(generated, key)) return generated[key];
      if (Object.prototype.hasOwnProperty.call(generated, reference)) return generated[reference];
      return visit(reference);
    });
    visiting.delete(key);
    checked.add(key);
    if (!Object.prototype.hasOwnProperty.call(generated, key)) resolved[key] = value;
    return resolved[key];
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

export function resolveLocalHostname(configured: string | undefined, key: string, projectId: string, ownerId: string, suffix = ".localhost"): string {
  const template = (configured ?? `${key}-{instance}${suffix}`).replaceAll("{project}", projectId);
  const ownerLabel = template.split(".").find((label) => label.includes("{instance}"));
  const budget = ownerLabel ? 63 - ownerLabel.replaceAll("{instance}", "").length : 63;
  if (budget < 14) invalid(`hostnames.${key}`, "hostname has no room for an opaque owner component.");
  const safeOwner = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(ownerId) && ownerId.length <= budget ? ownerId : `${ownerId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, budget - 13).replace(/-+$/g, "") || "o"}-${createHash("sha256").update(ownerId).digest("hex").slice(0, 12)}`;
  const result = template.replaceAll("{instance}", safeOwner);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+localhost$/i.test(result)) invalid(`hostnames.${key}`, `local hostname ${result} must be a concrete .localhost name.`);
  return result;
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
  const composeUrls: Record<string, string> = Object.create(null);
  const httpPorts = new Set<string>();
  const httpSchemes = new Map<string, string>();
  const healthUrls = new Map<string, string>();
  const selectedRouteHostnames = new Set<string>();
  if (plan.proxy) for (const [name, hostname] of Object.entries(config.hostnames ?? {})) {
    if (!hostname.profiles || hostname.profiles.includes(plan.profile)) {
      selectedRouteHostnames.add(resolveLocalHostname(hostname.hostname, name, config.project.id, ownerId, input.hostnameSuffix).toLowerCase());
      httpPorts.add(hostname.target);
    }
  }
  for (const node of plan.nodes) {
    const health = node.kind === "process" ? config.processes?.[node.name]?.health : config.services?.[node.name]?.health;
    if (health?.type !== "http") continue;
    const field = `${node.kind === "process" ? "processes" : "services"}.${node.name}.health`;
    let url: URL;
    try { url = new URL(resolveHttpReadinessUrl(health, ports)); }
    catch (error) { invalid(field, `invalid direct HTTP readiness URL: ${error instanceof Error ? error.message : String(error)}`); }
    if (!health.port && selectedRouteHostnames.has(url.hostname.toLowerCase().replace(/\.$/, ""))) invalid(field, "URL-only readiness cannot wait for a selected proxy route before installation; use its leased port.");
    if (health.port) {
      if (health.url && selectedRouteHostnames.has(new URL(health.url).hostname.toLowerCase().replace(/\.$/, ""))) url.protocol = "http:";
      httpPorts.add(health.port);
      httpSchemes.set(health.port, url.protocol.slice(0, -1));
    }
    healthUrls.set(node.name, url.toString());
  }
  for (const name of plan.portNames) {
    const port = ports[name];
    if (!Number.isInteger(port) || port < 1 || port > 65535) invalid(`ports.${name}`, "requires a leased port between 1 and 65535.");
    generated[`DEVFN_PORT_${normalized(name)}`] = String(port);
    const alias = config.ports?.[name]?.env;
    if (alias) generated[alias] = String(port);
    if (httpPorts.has(name) && config.ports?.[name]?.protocol !== "udp") {
      const url = `${httpSchemes.get(name) ?? "http"}://127.0.0.1:${port}`;
      directUrls[name] = url;
      generated[`DEVFN_URL_${normalized(name)}`] = url;
      for (const node of plan.nodes) {
        if (node.kind !== "service") continue;
        const service = config.services?.[node.name];
        const internal = service?.ports?.[name];
        if (internal !== undefined) composeUrls[name] = `${httpSchemes.get(name) ?? "http"}://${service!.service}:${internal}`;
      }
    }
  }
  const environment = resolveValues(profile.environment ?? {}, generated, generated, `profiles.${plan.profile}.environment`);
  const nodes: Record<string, ResolvedNodeStartup> = Object.create(null);
  for (const node of plan.nodes) {
    const spec = node.kind === "process" ? config.processes?.[node.name] : config.services?.[node.name];
    if (!spec) invalid(`nodes.${node.name}`, "selected node is missing.");
    const field = `${node.kind === "process" ? "processes" : "services"}.${node.name}`;
    const profileKeys = new Map(Object.keys(profile.environment ?? {}).map((key) => [key.toUpperCase(), key]));
    for (const key of Object.keys(spec.env ?? {})) {
      const profileKey = profileKeys.get(key.toUpperCase());
      if (profileKey && profileKey !== key) invalid(`${field}.env.${key}`, `collides with profile environment key ${profileKey}.`);
    }
    const processSpec = node.kind === "process" ? config.processes![node.name] : undefined;
    const nativeBind: Record<string, string> = processSpec && processSpec.exposure !== "public" ? { HOST: "127.0.0.1", DEVFN_HOST: "127.0.0.1" } : {};
    const nodeGenerated = node.kind === "service" ? { ...generated, ...Object.fromEntries(Object.entries(composeUrls).map(([name, url]) => [`DEVFN_URL_${normalized(name)}`, url])) } : generated;
    const profileEnvironment = node.kind === "service" ? resolveValues(profile.environment ?? {}, nodeGenerated, nodeGenerated, `profiles.${plan.profile}.environment`) : environment;
    const nodeEnvironment = resolveValues(spec.env ?? {}, { ...profileEnvironment, ...nativeBind }, { ...nodeGenerated, ...nativeBind }, `${field}.env`);
    const lookup = (key: string): string => {
      if (!Object.prototype.hasOwnProperty.call(nodeEnvironment, key)) invalid(field, `missing reference ${key}.`);
      return nodeEnvironment[key];
    };
    const argv = (item: string, location: string): string => {
      const value = expand(item, location, lookup);
      if (value.length === 0) invalid(location, "argv value cannot be empty.");
      return value;
    };
    const command = processSpec?.command?.map((item, index) => argv(item, `${field}.command[${index}]`));
    const script = processSpec?.script !== undefined ? argv(processSpec.script, `${field}.script`) : undefined;
    const healthCommand = spec.health?.type === "command" ? spec.health.command.map((item, index) => argv(item, `${field}.health.command[${index}]`)) : undefined;
    nodes[node.name] = { environment: nodeEnvironment, ...(healthUrls.has(node.name) ? { healthUrl: healthUrls.get(node.name) } : {}), ...(command ? { command } : {}), ...(script ? { script } : {}), ...(healthCommand ? { healthCommand } : {}) };
  }
  return { ownerId, generated, environment, directUrls, composeUrls, nodes };
}
