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
  /** Non-secret host-side values for readiness commands executed outside Compose. */
  readinessEnvironment: Record<string, string>;
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
const CREDENTIAL_QUERY_KEYS = new Set([
  "accesskey", "accesskeyid", "accesstoken", "apikey", "auth", "authorization", "authtoken",
  "bearer", "clientsecret", "credential", "credentials", "key", "passwd", "password",
  "privatekey", "pwd", "refreshtoken", "secret", "secretkey", "sessionid", "sessiontoken",
  "sig", "signature", "token", "xamzcredential", "xamzsignature", "xgoogcredential", "xgoogsignature",
]);

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
  // Parse the manifest source only. Referenced values (including opaque owners)
  // are data and must never be parsed as another template.
  const literal = value.replace(REFERENCE, "");
  if (literal.includes("{{") || literal.includes("}}")) invalid(field, "malformed template reference.");
  const expanded = value.replace(REFERENCE, (_match, key: string) => lookup(key));
  if (expanded.includes("\0")) invalid(field, "NUL is not a valid environment or argv value.");
  rejectUrlCredentials(expanded, field);
  rejectCredentialArgument(expanded, field);
  return expanded;
}

function rejectCredentialArgument(value: string, field: string): void {
  for (const argument of value.matchAll(/(?:^|\s)--([A-Za-z][A-Za-z0-9_-]*)(?==|\s|$)/g)) {
    if (CREDENTIAL_QUERY_KEYS.has(argument[1].replace(/[^a-z0-9]/gi, "").toLowerCase())) {
      invalid(field, "credential-bearing argv must use the secret channel.");
    }
  }
}

function rejectUrlCredentials(value: string, field: string): void {
  for (const match of value.matchAll(/[?&#]([^=?#&]+)=([^&#]*)/g)) {
    const key = new URLSearchParams(`${match[1]}=x`).keys().next().value ?? match[1];
    if (CREDENTIAL_QUERY_KEYS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())) {
      invalid(field, "credential-bearing URL must use the secret channel.");
    }
  }
  // Quotes can occur inside URL userinfo, so they cannot delimit a candidate.
  for (let candidate of value.match(/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>]+/g) ?? []) {
    while (candidate) {
      try {
        const url = new URL(candidate);
        const fragment = url.hash.slice(1);
        const fragmentParameters = new URLSearchParams(fragment.includes("?") ? fragment.slice(fragment.indexOf("?") + 1) : fragment);
        const sensitiveQueryKey = [...url.searchParams.keys(), ...fragmentParameters.keys()].some((key) =>
          CREDENTIAL_QUERY_KEYS.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase()));
        if (url.username || url.password || sensitiveQueryKey) invalid(field, "credential-bearing URL must use the secret channel.");
        break;
      } catch (error) {
        if (error instanceof DevFnError) throw error;
        // A quoted argv fragment may leave a closing delimiter on the URL.
        if (!/["'`),;\]}]$/.test(candidate)) break;
        candidate = candidate.slice(0, -1);
      }
    }
  }
}

function normalized(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function resolveLocalHostname(configured: string | undefined, key: string, projectId: string, ownerId: string, suffix = ".localhost"): string {
  const template = (configured ?? `${key}-{instance}${suffix}`).replaceAll("{project}", projectId);
  const ownerLabel = template.split(".").find((label) => label.includes("{instance}"));
  const budget = ownerLabel ? 63 - ownerLabel.replaceAll("{instance}", "").length : 63;
  if (budget < 14) invalid(`hostnames.${key}`, "hostname has no room for an opaque owner component.");
  const safeOwner = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ownerId) && ownerId.length <= budget ? ownerId : `${ownerId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, budget - 13).replace(/-+$/g, "") || "o"}-${createHash("sha256").update(ownerId).digest("hex").slice(0, 12)}`;
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
    if (health.url) rejectUrlCredentials(health.url, `${field}.url`);
    let url: URL;
    try { url = new URL(resolveHttpReadinessUrl(health, ports)); }
    catch (error) { invalid(field, `invalid direct HTTP readiness URL: ${error instanceof Error ? error.message : String(error)}`); }
    rejectUrlCredentials(url.toString(), field);
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
    const nodeGenerated = { ...generated };
    if (node.kind === "service") {
      const consumerProject = config.services![node.name].projectName ?? "devfn";
      const unreachable = new Set<string>();
      for (const producer of plan.nodes) {
        const producerPorts = producer.kind === "service" ? config.services![producer.name].ports ?? {} :
          Object.fromEntries((config.processes![producer.name].ports ?? []).map((port) => [port, true]));
        for (const port of Object.keys(producerPorts)) {
          const key = `DEVFN_URL_${normalized(port)}`;
          if (!Object.prototype.hasOwnProperty.call(directUrls, port)) continue;
          if (producer.kind === "service" && (config.services![producer.name].projectName ?? "devfn") === consumerProject) nodeGenerated[key] = composeUrls[port];
          else { delete nodeGenerated[key]; unreachable.add(key); }
        }
      }
      for (const value of [...Object.values(profile.environment ?? {}), ...Object.values(spec.env ?? {})]) {
        for (const match of value.matchAll(REFERENCE)) if (unreachable.has(match[1])) {
          invalid(field, producerIsNative(plan, config, match[1]) ?
            `reference ${match[1]} points to a native loopback process unreachable from Compose.` :
            `reference ${match[1]} is in another Compose project network.`);
        }
      }
    }
    const profileEnvironment = node.kind === "service" ? resolveValues(profile.environment ?? {}, nodeGenerated, nodeGenerated, `profiles.${plan.profile}.environment`) : environment;
    const nodeEnvironment = resolveValues(spec.env ?? {}, { ...profileEnvironment, ...nativeBind }, { ...nodeGenerated, ...nativeBind }, `${field}.env`);
    const readinessEnvironment = node.kind === "service" ?
      resolveValues(spec.env ?? {}, environment, generated, `${field}.env`) : nodeEnvironment;
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
    const healthLookup = (key: string): string => {
      if (!Object.prototype.hasOwnProperty.call(readinessEnvironment, key)) invalid(field, `missing reference ${key}.`);
      return readinessEnvironment[key];
    };
    const healthCommand = spec.health?.type === "command" ? spec.health.command.map((item, index) => {
      const location = `${field}.health.command[${index}]`;
      const value = expand(item, location, healthLookup);
      if (!value.length) invalid(location, "argv value cannot be empty.");
      return value;
    }) : undefined;
    nodes[node.name] = { environment: nodeEnvironment, readinessEnvironment, ...(healthUrls.has(node.name) ? { healthUrl: healthUrls.get(node.name) } : {}), ...(command ? { command } : {}), ...(script ? { script } : {}), ...(healthCommand ? { healthCommand } : {}) };
  }
  return { ownerId, generated, environment, directUrls, composeUrls, nodes };
}

function producerIsNative(plan: LifecyclePlan, config: DevFnConfig, key: string): boolean {
  return plan.nodes.some((node) => node.kind === "process" &&
    (config.processes?.[node.name]?.ports ?? []).some((port) => `DEVFN_URL_${normalized(port)}` === key));
}
