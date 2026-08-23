import path from "node:path";

import type {
  ComposeServiceSpec,
  DevFnConfig,
  DevFnPolicy,
  EnvironmentOutput,
  HealthCheck,
  HostnameSpec,
  PortPolicyEntry,
  PortSpec,
  ProcessSpec,
  ProfileSpec,
  RuntimePrerequisite,
} from "./types.js";
import { DevFnConfigError } from "./errors.js";

type RecordValue = Record<string, unknown>;
const SENSITIVE_KEY = /(authorization|token|secret|password|cookie|api[-_]?key|session[-_]?id|access[-_]?key|refresh[-_]?token)/i;

function fail(message: string, field?: string): never {
  throw new DevFnConfigError("DEVFN_CONFIG_INVALID", message, field);
}

function record(value: unknown, field: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object.`, field);
  return value as RecordValue;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${field} must be a non-empty string.`, field);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : string(value, field);
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(`${field} must be an array.`, field);
  return value.map((item, index) => string(item, `${field}[${index}]`));
}

function stringMap(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  return Object.fromEntries(Object.entries(record(value, field)).map(([key, item]) => [key, string(item, `${field}.${key}`)]));
}

function integer(value: unknown, field: string, min = 1, max = 65535): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${field} must be an integer between ${min} and ${max}.`, field);
  }
  return value as number;
}

function range(value: unknown, field: string): [number, number] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 2) fail(`${field} must be a two-item port range.`, field);
  const start = integer(value[0], `${field}[0]`);
  const end = integer(value[1], `${field}[1]`);
  if (start > end) fail(`${field} must be ascending.`, field);
  return [start, end];
}

function relativePath(value: unknown, field: string): string {
  const result = string(value, field);
  if (path.isAbsolute(result) || result.split(/[\\/]+/).includes("..")) {
    throw new DevFnConfigError("DEVFN_CONFIG_PATH_ESCAPE", `${field} must stay inside the repository.`, field);
  }
  return result;
}

function healthTimeout(input: RecordValue, field: string): { timeoutMs?: number } {
  const timeoutMs = input.timeoutMs === undefined ? undefined : integer(input.timeoutMs, `${field}.timeoutMs`, 1, 3_600_000);
  return timeoutMs === undefined ? {} : { timeoutMs };
}

function httpHealth(input: RecordValue, field: string): HealthCheck {
  if (input.url === undefined && input.port === undefined) fail(`${field} requires url or port.`, field);
  const url = optionalString(input.url, `${field}.url`);
  const port = optionalString(input.port, `${field}.port`);
  const healthPath = optionalString(input.path, `${field}.path`);
  return { type: "http", ...(url ? { url } : {}), ...(port ? { port } : {}), ...(healthPath ? { path: healthPath } : {}), ...(input.expectedStatus === undefined ? {} : { expectedStatus: integer(input.expectedStatus, `${field}.expectedStatus`, 100, 599) }), ...healthTimeout(input, field) };
}

function commandHealth(input: RecordValue, field: string): HealthCheck {
  const command = stringArray(input.command, `${field}.command`);
  if (!command?.length) fail(`${field}.command cannot be empty.`, `${field}.command`);
  return { type: "command", command, ...healthTimeout(input, field) };
}

function health(value: unknown, field: string): HealthCheck | undefined {
  if (value === undefined) return undefined;
  const input = record(value, field);
  switch (string(input.type, `${field}.type`)) {
    case "http": return httpHealth(input, field);
    case "tcp": return { type: "tcp", port: string(input.port, `${field}.port`), ...healthTimeout(input, field) };
    case "command": return commandHealth(input, field);
    case "log": return { type: "log", pattern: string(input.pattern, `${field}.pattern`), ...healthTimeout(input, field) };
    default: return fail(`${field}.type is unsupported.`, `${field}.type`);
  }
}

function portSpec(value: unknown, field: string): PortSpec {
  const input = record(value, field);
  const preferred = input.preferred === undefined ? undefined : integer(input.preferred, `${field}.preferred`);
  const configuredRange = range(input.range, `${field}.range`);
  const ephemeral = input.ephemeral === true;
  const exact = input.exact === true;
  const block = optionalString(input.block, `${field}.block`);
  if (exact && preferred === undefined) fail(`${field}.preferred is required when exact is true.`, field);
  if (ephemeral && (preferred !== undefined || configuredRange !== undefined || exact || block !== undefined)) {
    fail(`${field} ephemeral ports cannot also be preferred, ranged, exact, or part of a block.`, field);
  }
  const protocol = input.protocol === undefined ? "tcp" : string(input.protocol, `${field}.protocol`);
  if (protocol !== "tcp" && protocol !== "udp") fail(`${field}.protocol must be tcp or udp.`, `${field}.protocol`);
  const exposure = input.exposure === undefined ? "loopback" : string(input.exposure, `${field}.exposure`);
  if (exposure !== "loopback" && exposure !== "public") fail(`${field}.exposure must be loopback or public.`, `${field}.exposure`);
  return {
    protocol,
    exposure,
    ...(preferred === undefined ? {} : { preferred }),
    ...(configuredRange === undefined ? {} : { range: configuredRange }),
    ...(exact ? { exact } : {}),
    ...(ephemeral ? { ephemeral } : {}),
    ...(input.internal === undefined ? {} : { internal: integer(input.internal, `${field}.internal`) }),
    ...(block ? { block } : {}),
    ...(optionalString(input.env, `${field}.env`) ? { env: optionalString(input.env, `${field}.env`) } : {}),
  };
}

function environmentFields(input: RecordValue, field: string): Pick<ProcessSpec, "env" | "envAllowlist" | "secretEnv"> {
  const env = stringMap(input.env, `${field}.env`);
  const envAllowlist = stringArray(input.envAllowlist, `${field}.envAllowlist`);
  const secretEnv = stringArray(input.secretEnv, `${field}.secretEnv`);
  for (const key of Object.keys(env ?? {})) if (SENSITIVE_KEY.test(key)) fail(`${field}.env.${key} must not contain a literal secret; inherit it through envAllowlist and declare it in secretEnv.`, `${field}.env.${key}`);
  for (const key of secretEnv ?? []) if (!envAllowlist?.includes(key)) fail(`${field}.secretEnv contains ${key}, which is not present in envAllowlist.`, `${field}.secretEnv`);
  for (const key of envAllowlist ?? []) if (SENSITIVE_KEY.test(key) && !secretEnv?.includes(key)) fail(`${field}.envAllowlist contains sensitive key ${key}; declare it in secretEnv for log redaction.`, `${field}.envAllowlist`);
  return { ...(env ? { env } : {}), ...(envAllowlist ? { envAllowlist } : {}), ...(secretEnv ? { secretEnv } : {}) };
}

function processSpec(value: unknown, field: string): ProcessSpec {
  const input = record(value, field);
  const adapter = string(input.adapter, `${field}.adapter`) as ProcessSpec["adapter"];
  if (!["command", "npm", "pnpm", "turbo", "wrangler", "xcode", "extfn"].includes(adapter)) {
    fail(`${field}.adapter is unsupported.`, `${field}.adapter`);
  }
  const command = stringArray(input.command, `${field}.command`);
  const script = optionalString(input.script, `${field}.script`);
  if (adapter === "command" && !command?.length) fail(`${field}.command is required for command adapters.`, field);
  if ((adapter === "npm" || adapter === "pnpm") && !script) fail(`${field}.script is required for ${adapter}.`, field);
  const exposure = input.exposure === undefined ? "local" : string(input.exposure, `${field}.exposure`);
  if (exposure !== "local" && exposure !== "public") fail(`${field}.exposure must be local or public.`, `${field}.exposure`);
  const ports = stringArray(input.ports, `${field}.ports`);
  const dependsOn = stringArray(input.dependsOn, `${field}.dependsOn`);
  const parsedHealth = health(input.health, `${field}.health`);
  return {
    adapter,
    exposure,
    ...(command ? { command } : {}),
    ...(script ? { script } : {}),
    ...(input.cwd === undefined ? {} : { cwd: relativePath(input.cwd, `${field}.cwd`) }),
    ...environmentFields(input, field),
    ...(ports ? { ports } : {}),
    ...(dependsOn ? { dependsOn } : {}),
    ...(parsedHealth ? { health: parsedHealth } : {}),
    ...(input.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: integer(input.shutdownTimeoutMs, `${field}.shutdownTimeoutMs`, 1, 3_600_000) }),
  };
}

function serviceSpec(value: unknown, field: string): ComposeServiceSpec {
  const input = record(value, field);
  if (input.adapter !== "compose") fail(`${field}.adapter must be compose.`, `${field}.adapter`);
  const ports = input.ports === undefined ? undefined : Object.fromEntries(
    Object.entries(record(input.ports, `${field}.ports`)).map(([name, internal]) => [name, integer(internal, `${field}.ports.${name}`)]),
  );
  const dependsOn = stringArray(input.dependsOn, `${field}.dependsOn`);
  const parsedHealth = health(input.health, `${field}.health`);
  return {
    adapter: "compose",
    service: string(input.service, `${field}.service`),
    ...(input.file === undefined ? {} : { file: relativePath(input.file, `${field}.file`) }),
    ...(optionalString(input.projectName, `${field}.projectName`) ? { projectName: optionalString(input.projectName, `${field}.projectName`) } : {}),
    ...(ports ? { ports } : {}),
    ...(dependsOn ? { dependsOn } : {}),
    ...(parsedHealth ? { health: parsedHealth } : {}),
    ...(input.persistent === undefined ? {} : { persistent: input.persistent === true }),
    ...environmentFields(input, field),
  };
}

function profileSpec(value: unknown, field: string): ProfileSpec {
  const input = record(value, field);
  const environment = stringMap(input.environment, `${field}.environment`);
  for (const key of Object.keys(environment ?? {})) if (SENSITIVE_KEY.test(key)) fail(`${field}.environment.${key} must not contain a secret. Use process envAllowlist and secretEnv.`, `${field}.environment.${key}`);
  return {
    ...(stringArray(input.processes, `${field}.processes`) ? { processes: stringArray(input.processes, `${field}.processes`) } : {}),
    ...(stringArray(input.services, `${field}.services`) ? { services: stringArray(input.services, `${field}.services`) } : {}),
    ...(environment ? { environment } : {}),
    ...(input.proxy === undefined ? {} : { proxy: input.proxy === true }),
  };
}

function hostnameSpec(value: unknown, field: string): HostnameSpec {
  const input = record(value, field);
  const tls = input.tls === undefined ? "off" : string(input.tls, `${field}.tls`);
  if (tls !== "off" && tls !== "internal") fail(`${field}.tls must be off or internal.`, `${field}.tls`);
  const hostname = optionalString(input.hostname, `${field}.hostname`);
  const expandedHostname = hostname?.replaceAll("{project}", "project").replaceAll("{instance}", "instance");
  if (hostname && (expandedHostname?.includes("{") || expandedHostname?.includes("}") || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+localhost$/i.test(expandedHostname!))) {
    fail(`${field}.hostname must be a .localhost hostname using only {project} and {instance} placeholders.`, `${field}.hostname`);
  }
  return {
    target: string(input.target, `${field}.target`),
    ...(hostname ? { hostname } : {}),
    tls,
    ...(stringArray(input.profiles, `${field}.profiles`) ? { profiles: stringArray(input.profiles, `${field}.profiles`) } : {}),
  };
}

function prerequisites(value: unknown): RuntimePrerequisite[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail("prerequisites must be an array.", "prerequisites");
  return value.map((item, index) => {
    const input = record(item, `prerequisites[${index}]`);
    return {
      command: string(input.command, `prerequisites[${index}].command`),
      ...(optionalString(input.version, `prerequisites[${index}].version`) ? { version: optionalString(input.version, `prerequisites[${index}].version`) } : {}),
      ...(input.optional === undefined ? {} : { optional: input.optional === true }),
      ...(stringArray(input.profiles, `prerequisites[${index}].profiles`) ? { profiles: stringArray(input.profiles, `prerequisites[${index}].profiles`) } : {}),
    };
  });
}

function environmentOutputs(value: unknown): EnvironmentOutput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail("environmentOutputs must be an array.", "environmentOutputs");
  return value.map((item, index) => {
    const input = record(item, `environmentOutputs[${index}]`);
    const format = input.format === undefined ? "dotenv" : string(input.format, `environmentOutputs[${index}].format`);
    if (format !== "dotenv" && format !== "json") fail("Environment output format must be dotenv or json.");
    return {
      path: relativePath(input.path, `environmentOutputs[${index}].path`),
      format,
      ...(input.mode === undefined ? {} : { mode: (() => {
        const mode = integer(input.mode, `environmentOutputs[${index}].mode`, 0, 0o777);
        if ((mode & 0o077) !== 0) fail(`environmentOutputs[${index}].mode must not grant group or other permissions.`, `environmentOutputs[${index}].mode`);
        return mode;
      })() }),
    } as EnvironmentOutput;
  });
}

function named<T>(value: unknown, field: string, parser: (item: unknown, itemField: string) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(record(value, field)).map(([name, item]) => [name, parser(item, `${field}.${name}`)]));
}

function validateProcessReferences(config: DevFnConfig, ports: Set<string>, nodes: Set<string>): void {
  for (const [name, process] of Object.entries(config.processes ?? {})) {
    for (const port of process.ports ?? []) if (!ports.has(port)) fail(`processes.${name} references unknown port ${port}.`);
    const healthPort = process.health && (process.health.type === "http" || process.health.type === "tcp") ? process.health.port : undefined;
    if (healthPort && (!ports.has(healthPort) || !process.ports?.includes(healthPort))) fail(`processes.${name}.health references port ${healthPort}, which must also appear in processes.${name}.ports.`);
    if (healthPort && config.ports?.[healthPort]?.protocol === "udp") fail(`processes.${name}.health requires TCP port ${healthPort}, but that allocation uses UDP.`);
    for (const dependency of process.dependsOn ?? []) if (!nodes.has(dependency)) fail(`processes.${name} references unknown dependency ${dependency}.`);
  }
}

function validateServiceReferences(config: DevFnConfig, ports: Set<string>, nodes: Set<string>): void {
  for (const [name, service] of Object.entries(config.services ?? {})) {
    for (const port of Object.keys(service.ports ?? {})) if (!ports.has(port)) fail(`services.${name} references unknown port ${port}.`);
    const healthPort = service.health && (service.health.type === "http" || service.health.type === "tcp") ? service.health.port : undefined;
    if (healthPort && (!ports.has(healthPort) || service.ports?.[healthPort] === undefined)) fail(`services.${name}.health references port ${healthPort}, which must also appear in services.${name}.ports.`);
    if (healthPort && config.ports?.[healthPort]?.protocol === "udp") fail(`services.${name}.health requires TCP port ${healthPort}, but that allocation uses UDP.`);
    for (const dependency of service.dependsOn ?? []) if (!nodes.has(dependency)) fail(`services.${name} references unknown dependency ${dependency}.`);
  }
}

function validateSelectionReferences(config: DevFnConfig, ports: Set<string>, processes: Set<string>, services: Set<string>): void {
  for (const [name, profile] of Object.entries(config.profiles)) {
    for (const process of profile.processes ?? []) if (!processes.has(process)) fail(`profiles.${name} references unknown process ${process}.`);
    for (const service of profile.services ?? []) if (!services.has(service)) fail(`profiles.${name} references unknown service ${service}.`);
  }
  for (const [name, hostname] of Object.entries(config.hostnames ?? {})) {
    if (!ports.has(hostname.target)) fail(`hostnames.${name} references unknown port ${hostname.target}.`);
    for (const profile of hostname.profiles ?? []) if (!config.profiles[profile]) fail(`hostnames.${name} references unknown profile ${profile}.`);
  }
  if (config.defaultProfile && !config.profiles[config.defaultProfile]) fail(`defaultProfile references unknown profile ${config.defaultProfile}.`);
}

function validateReferences(config: DevFnConfig): void {
  const ports = new Set(Object.keys(config.ports ?? {}));
  const processes = new Set(Object.keys(config.processes ?? {}));
  const services = new Set(Object.keys(config.services ?? {}));
  for (const name of [...processes, ...services]) if (!/^[A-Za-z0-9_.-]+$/.test(name) || name !== name.trim()) fail(`Lifecycle node ${name} must use only letters, numbers, dots, underscores, and hyphens.`);
  for (const name of ports) if (!/^[A-Za-z0-9_.-]+$/.test(name) || name !== name.trim()) fail(`Port name ${JSON.stringify(name)} must use only letters, numbers, dots, underscores, and hyphens.`);
  const collision = [...processes].find((name) => services.has(name));
  if (collision) fail(`Lifecycle node ${collision} cannot be both a process and a service.`);
  const nodes = new Set([...processes, ...services]);
  validateProcessReferences(config, ports, nodes);
  validateServiceReferences(config, ports, nodes);
  validateSelectionReferences(config, ports, processes, services);
  const environmentOwners = new Map<string, string>();
  for (const [name, spec] of Object.entries(config.ports ?? {})) {
    if (spec.env?.startsWith("DEVFN_")) fail(`ports.${name}.env cannot use reserved DEVFN_ runtime variables.`, `ports.${name}.env`);
    const generated = `DEVFN_PORT_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
    for (const environmentName of new Set([generated, ...(spec.env ? [spec.env] : [])])) {
      const owner = environmentOwners.get(environmentName);
      if (owner !== undefined && owner !== name) fail(`Ports ${owner} and ${name} both emit environment variable ${environmentName}.`, `ports.${name}`);
      environmentOwners.set(environmentName, name);
    }
  }
  for (const [name, spec] of Object.entries(config.hostnames ?? {})) {
    const expanded = (spec.hostname ?? `${name}-{instance}.localhost`).replaceAll("{instance}", "instance").replaceAll("{project}", config.project.id);
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+localhost$/i.test(expanded)) fail(`hostnames.${name}.hostname resolves to an invalid .localhost hostname for project ${config.project.id}.`, `hostnames.${name}.hostname`);
  }
}

export function validateDevFnConfig(value: unknown): DevFnConfig {
  const input = record(value, "config");
  if (input.version !== 1) fail("config.version must be 1.", "version");
  const project = record(input.project, "project");
  const profiles = named(input.profiles, "profiles", profileSpec);
  if (Object.keys(profiles).length === 0) fail("At least one profile is required.", "profiles");
  const config: DevFnConfig = {
    version: 1,
    project: { id: string(project.id, "project.id"), ...(optionalString(project.name, "project.name") ? { name: optionalString(project.name, "project.name") } : {}) },
    profiles,
    ...(optionalString(input.defaultProfile, "defaultProfile") ? { defaultProfile: optionalString(input.defaultProfile, "defaultProfile") } : {}),
    ...(input.runtimeDir === undefined ? {} : { runtimeDir: relativePath(input.runtimeDir, "runtimeDir") }),
    ...(input.ports === undefined ? {} : { ports: named(input.ports, "ports", portSpec) }),
    ...(input.processes === undefined ? {} : { processes: named(input.processes, "processes", processSpec) }),
    ...(input.services === undefined ? {} : { services: named(input.services, "services", serviceSpec) }),
    ...(input.hostnames === undefined ? {} : { hostnames: named(input.hostnames, "hostnames", hostnameSpec) }),
    ...(prerequisites(input.prerequisites) ? { prerequisites: prerequisites(input.prerequisites) } : {}),
    ...(environmentOutputs(input.environmentOutputs) ? { environmentOutputs: environmentOutputs(input.environmentOutputs) } : {}),
    ...(input.policy === undefined ? {} : { policy: relativePath(input.policy, "policy") }),
  };
  if (!config.defaultProfile && !config.profiles.default) {
    fail("profiles.default is required when defaultProfile is omitted.", "profiles.default");
  }
  validateReferences(config);
  return config;
}

function policyEntry(value: unknown, field: string): PortPolicyEntry {
  const input = record(value, field);
  const kind = string(input.kind, `${field}.kind`);
  if (!["protected", "preferred", "excluded"].includes(kind)) fail(`${field}.kind is unsupported.`);
  const configuredRange = range(input.range, `${field}.range`);
  const port = input.port === undefined ? undefined : integer(input.port, `${field}.port`);
  if ((port === undefined) === (configuredRange === undefined)) fail(`${field} requires exactly one of port or range.`);
  return {
    name: string(input.name, `${field}.name`),
    kind: kind as PortPolicyEntry["kind"],
    ...(port === undefined ? {} : { port }),
    ...(configuredRange === undefined ? {} : { range: configuredRange }),
    ...(optionalString(input.project, `${field}.project`) ? { project: optionalString(input.project, `${field}.project`) } : {}),
    ...(optionalString(input.description, `${field}.description`) ? { description: optionalString(input.description, `${field}.description`) } : {}),
  };
}

export function validateDevFnPolicy(value: unknown): DevFnPolicy {
  const input = record(value, "policy");
  if (input.version !== 1) fail("policy.version must be 1.", "version");
  const ports = input.ports === undefined ? undefined : (() => {
    if (!Array.isArray(input.ports)) fail("policy.ports must be an array.", "ports");
    return input.ports.map((item, index) => policyEntry(item, `ports[${index}]`));
  })();
  const hostnameSuffix = optionalString(input.hostnameSuffix, "hostnameSuffix");
  if (hostnameSuffix && (!hostnameSuffix.startsWith(".") || !hostnameSuffix.endsWith(".localhost"))) fail("hostnameSuffix must start with a dot and end in .localhost.", "hostnameSuffix");
  return {
    version: 1,
    ...(range(input.fallbackRange, "fallbackRange") ? { fallbackRange: range(input.fallbackRange, "fallbackRange") } : {}),
    ...(hostnameSuffix ? { hostnameSuffix } : {}),
    ...(ports ? { ports } : {}),
  };
}
