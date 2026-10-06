import { createHash } from "node:crypto";

import { isCredentialKey, validateDevFnConfig, type DevFnConfig } from "@devfn/config";
import { createProcessEnvironment, resolveHttpReadinessUrl } from "@devfn/processes";
import { composeProjectName, createComposeEnvironment } from "@devfn/compose";

import { DevFnError, type LifecyclePlan } from "./types.js";

export interface EndpointResolutionInput {
  config: DevFnConfig;
  plan: LifecyclePlan;
  /** Opaque lifecycle owner. Callers may choose more than one owner per checkout. */
  ownerId: string;
  ports: Readonly<Record<string, number>>;
  /** Effective policy suffix for selected local proxy hostnames. */
  hostnameSuffix?: string;
  /** Effective Compose network names for each selected service. Required for sibling DNS wiring. */
  composeNetworks?: Readonly<Record<string, readonly string[]>>;
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

function invalid(field: string, message: string): never {
  throw new DevFnError("DEVFN_RUNTIME_INVALID", `${field}: ${message}`);
}

interface CheckedValues {
  values: Record<string, string>;
  checked: Record<string, string>;
}

function resolveValues(values: Record<string, string>, base: CheckedValues, generated: CheckedValues, field: string): CheckedValues {
  const resolved: Record<string, string> = Object.assign(Object.create(null), base.values);
  const resolvedChecked: Record<string, string> = Object.assign(Object.create(null), base.checked);
  const generatedKeys = new Map(Object.keys(generated.values).map((key) => [key.toUpperCase(), key]));
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
    if (!generatedKey) { delete resolved[key]; delete resolvedChecked[key]; }
  }
  const visiting = new Set<string>();
  const checked = new Set<string>();
  const visit = (key: string): [string, string] => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      if (Object.prototype.hasOwnProperty.call(resolved, key)) return [resolved[key], resolvedChecked[key]];
      invalid(field, `missing reference ${key}.`);
    }
    if (checked.has(key)) return [resolved[key], resolvedChecked[key]];
    if (visiting.has(key)) invalid(field, `cyclic reference containing ${key}.`);
    visiting.add(key);
    const expanded = expand(values[key], `${field}.${key}`, (reference) => {
      if (reference === key && Object.prototype.hasOwnProperty.call(generated.values, key)) return [generated.values[key], generated.checked[key]];
      if (Object.prototype.hasOwnProperty.call(generated.values, reference)) return [generated.values[reference], generated.checked[reference]];
      return visit(reference);
    });
    visiting.delete(key);
    checked.add(key);
    if (!Object.prototype.hasOwnProperty.call(generated.values, key)) {
      resolved[key] = expanded[0];
      resolvedChecked[key] = expanded[1];
    }
    return [resolved[key], resolvedChecked[key]];
  };
  for (const key of Object.keys(values)) visit(key);
  return { values: resolved, checked: resolvedChecked };
}

function expand(value: string, field: string, lookup: (name: string) => [string, string]): [string, string] {
  // Parse the manifest source only. Referenced values (including opaque owners)
  // are data and must never be parsed as another template.
  const literal = value.replace(REFERENCE, "");
  if (literal.includes("{{") || literal.includes("}}")) invalid(field, "malformed template reference.");
  // Manifest syntax is checked before substitution. The owner is opaque data:
  // its bytes may resemble a credential argument or URL without declaring one.
  rejectUrlCredentials(value, field);
  rejectCredentialArgument(value, field);
  const references = new Map<string, [string, string]>();
  const resolved = (key: string): [string, string] => {
    if (!references.has(key)) references.set(key, lookup(key));
    return references.get(key)!;
  };
  const expanded = value.replace(REFERENCE, (_match, key: string) => resolved(key)[0]);
  if (expanded.includes("\0")) invalid(field, "NUL is not a valid environment or argv value.");
  const checked = value.replace(REFERENCE, (_match, key: string) => resolved(key)[1]);
  rejectUrlCredentials(checked, field);
  rejectCredentialArgument(checked, field);
  return [expanded, checked];
}

function rejectCredentialArgument(value: string, field: string): void {
  // Percent encoding is data to the resolver, but many command-line clients
  // decode it before sending a header or URL. Inspect both representations.
  for (const checked of decodedVariants(value)) {
    rejectStructuredCredentialPayload(checked, field);
    for (const argument of checked.matchAll(/(?:^|\s)--([A-Za-z][A-Za-z0-9_-]*)(?==|\s|$)/g)) {
      if (isCredentialKey(argument[1])) invalid(field, "credential-bearing argv must use the secret channel.");
    }
    // Template fragments can assemble an otherwise hidden credential header.
    for (const header of checked.matchAll(/(?:^|[^A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_-]*)\s*:/g)) {
      if (isCredentialKey(header[1])) invalid(field, "credential-bearing header must use the secret channel.");
    }
  }
  rejectCredentialVector([value], field);
}

/** Inspect JSON bodies as data, including JSON escapes in field names. */
function rejectStructuredCredentialPayload(value: string, field: string): void {
  const inspect = (root: unknown): void => {
    const pending: unknown[] = [root];
    while (pending.length) {
      const node = pending.pop();
      if (Array.isArray(node)) { for (const child of node) pending.push(child); continue; }
      if (node === null || typeof node !== "object") continue;
      for (const [key, child] of Object.entries(node)) {
        if (isCredentialKey(key)) invalid(field, "credential-bearing structured argv must use the secret channel.");
        pending.push(child);
      }
    }
  };
  // A script or --data-raw= argument may contain a JSON body after other
  // text. Include shell-quoted JSON in package scripts without executing it.
  const candidates = [value];
  for (let depth = 0; depth < 2; depth += 1) {
    const unquoted = candidates.at(-1)!.replaceAll('\\"', '"');
    if (unquoted === candidates.at(-1)) break;
    candidates.push(unquoted);
  }
  for (const candidate of candidates) {
    const stack: string[] = [];
    let start = -1;
    let quoted = false;
    let escaped = false;
    for (let end = 0; end < candidate.length; end += 1) {
      const char = candidate[end];
      if (stack.length === 0) {
        if (char !== "{" && char !== "[") continue;
        start = end;
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{" || char === "[") stack.push(char);
      else if (char === "}" || char === "]") {
        if (stack.pop() !== (char === "}" ? "{" : "[")) { stack.length = 0; quoted = false; continue; }
        if (stack.length === 0) {
          try { inspect(JSON.parse(candidate.slice(start, end + 1)) as unknown); }
          catch (error) { if (error instanceof DevFnError) throw error; }
        }
      }
    }
  }
}

function decodedVariants(value: string): string[] {
  const variants = [value];
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const decoded = decodeURIComponent(variants.at(-1)!);
      if (decoded === variants.at(-1)) break;
      variants.push(decoded);
    } catch { break; }
  }
  return variants;
}

/** Curl permits no-value switches before a value-taking short option. */
function curlShortValueOption(token: string): { option: "H" | "u" | "U" | "d" | "F" | "b"; attached: string } | undefined {
  if (!token.startsWith("-") || token.startsWith("--")) return undefined;
  for (let index = 1; index < token.length; index += 1) {
    const option = token[index];
    if (option === "H" || option === "u" || option === "U" || option === "d" || option === "F" || option === "b") {
      return { option, attached: token.slice(index + 1).replace(/^=/, "") };
    }
    if (!"sSLkfiINO".includes(option)) return undefined;
  }
  return undefined;
}

function rejectCredentialCookies(raw: string, field: string): void {
  for (const candidate of decodedVariants(raw.replace(/["'`]/g, ""))) {
    for (const cookie of candidate.split(/[;&]/)) {
      const assignment = cookie.trim().match(/^([^=\s]+)=/);
      if (assignment && isCredentialKey(assignment[1])) invalid(field, "credential-bearing cookie must use the secret channel.");
    }
  }
}

/** Check options that become credential-bearing only with their value. */
function rejectCredentialVector(values: readonly string[], field: string): void {
  // Package scripts are one string; native commands and health probes are
  // vectors. Split only for inspection, never for execution or argv output.
  const variants = values.map(decodedVariants);
  for (let depth = 0; depth <= 2; depth += 1) {
    const tokens = variants.flatMap((items) => (items[depth] ?? items.at(-1)!).match(/\S+/g) ?? []);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index].replace(/^["']|["']$/g, "");
      const short = curlShortValueOption(token);
      // curl accepts both -Hname:value and -H name:value, as well as long
      // header options. A short attached header has no word boundary before
      // its name, so the general header scan above cannot identify it.
      const headerOption = token.match(/^--(?:proxy-)?header(?:=(.*))?$/i);
      if (headerOption || short?.option === "H") {
        const raw = headerOption ? headerOption[1] ?? tokens[index + 1] : short!.attached || tokens[index + 1];
        if (raw !== undefined) {
          const name = raw.replace(/["'`]/g, "").trimStart().match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:/)?.[1];
          if (name && isCredentialKey(name)) invalid(field, "credential-bearing header must use the secret channel.");
        }
      }
      const option = token.match(/^(--(?:proxy-)?user(?:name)?|-u|-U)(?:=(.*))?$/i);
      if (option || short?.option === "u" || short?.option === "U") {
        const raw = option ? option[2] ?? tokens[index + 1] : short!.attached || tokens[index + 1];
        if (raw !== undefined) for (const candidate of decodedVariants(raw.replace(/^["']|["']$/g, ""))) {
          if (candidate.includes(":")) invalid(field, "credential-bearing argv must use the secret channel.");
        }
      }
      // Form and query options carry name=value data that may be decoded by
      // the client after DevFn has already persisted the resolved argv.
      const formOption = token.match(/^(--(?:data(?:-ascii|-binary|-raw|-urlencode)?|form(?:-string)?|url-query)|-[dF])(?:=(.*))?$/i);
      if (formOption || short?.option === "d" || short?.option === "F") {
        const raw = formOption ? formOption[2] ?? tokens[index + 1] : short!.attached || tokens[index + 1];
        if (raw === undefined) continue;
        for (const candidate of decodedVariants(raw.replace(/^["']|["']$/g, "").replace(/^\+/, ""))) {
          const assignment = candidate.match(/^([^=:@\s]+)(?:=|:=|@)/);
          if (assignment && isCredentialKey(assignment[1])) invalid(field, "credential-bearing argv must use the secret channel.");
        }
      }
      const cookieOption = token.match(/^--cookie(?:=(.*))?$/i);
      if (cookieOption || short?.option === "b") {
        // Quoted cookie lists may have been split for inspection at spaces.
        const following = tokens.slice(index + 1);
        const nextOption = following.findIndex((item) => /^--?[A-Za-z]/.test(item));
        const raw = [cookieOption ? cookieOption[1] ?? "" : short!.attached,
          ...following.slice(0, nextOption < 0 ? undefined : nextOption)].join(" ");
        if (raw) rejectCredentialCookies(raw, field);
      }
    }
  }
}

function rejectUrlCredentials(value: string, field: string): void {
  for (const checked of decodedVariants(value)) rejectUrlCredentialsDecoded(checked, field);
}

function rejectUrlCredentialsDecoded(value: string, field: string): void {
  for (const match of value.matchAll(/[?&#]([^=?#&]+)=([^&#]*)/g)) {
    const key = new URLSearchParams(`${match[1]}=x`).keys().next().value ?? match[1];
    if (isCredentialKey(key)) {
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
          isCredentialKey(key));
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
  if (budget < 22) invalid(`hostnames.${key}`, "hostname has no room for an opaque owner component.");
  const safeOwner = `o-${createHash("sha256").update(ownerId).digest("hex").slice(0, 20)}`;
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
      if (health.url && selectedRouteHostnames.has(new URL(health.url).hostname.toLowerCase().replace(/\.$/, ""))) {
        url.protocol = "http:";
        // URL drops an explicit default HTTPS port before the scheme changes.
        // Restore the actual lease so startup, status and retry probe the same endpoint.
        url.port = String(ports[health.port]);
      }
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
        if (internal !== undefined && input.composeNetworks?.[node.name]?.length) composeUrls[name] = `${httpSchemes.get(name) ?? "http"}://${service!.service}:${internal}`;
      }
    }
  }
  const checkedGenerated: CheckedValues = { values: generated, checked: { ...generated, DEVFN_INSTANCE_ID: "devfnopaqueowner" } };
  const environment = resolveValues(profile.environment ?? {}, checkedGenerated, checkedGenerated, `profiles.${plan.profile}.environment`);
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
    const nodeGenerated: CheckedValues = { values: { ...generated }, checked: { ...checkedGenerated.checked } };
    if (node.kind === "service") {
      const consumerProject = composeProjectName(config.services![node.name].projectName ?? "devfn", ownerId);
      const unreachable = new Set<string>();
      for (const producer of plan.nodes) {
        const producerPorts = producer.kind === "service" ? config.services![producer.name].ports ?? {} :
          Object.fromEntries((config.processes![producer.name].ports ?? []).map((port) => [port, true]));
        for (const port of Object.keys(producerPorts)) {
          const key = `DEVFN_URL_${normalized(port)}`;
          if (!Object.prototype.hasOwnProperty.call(directUrls, port)) continue;
          const producerNetworks = input.composeNetworks?.[producer.name] ?? [];
          const consumerNetworks = input.composeNetworks?.[node.name] ?? [];
          const reachable = producerNetworks.some((name) => consumerNetworks.includes(name));
          if (producer.kind === "service" && composeProjectName(config.services![producer.name].projectName ?? "devfn", ownerId) === consumerProject && reachable) {
            nodeGenerated.values[key] = composeUrls[port];
            nodeGenerated.checked[key] = composeUrls[port];
          } else { delete nodeGenerated.values[key]; delete nodeGenerated.checked[key]; unreachable.add(key); }
        }
      }
      for (const value of [...Object.values(profile.environment ?? {}), ...Object.values(spec.env ?? {})]) {
        for (const match of value.matchAll(REFERENCE)) if (unreachable.has(match[1])) {
          invalid(field, producerIsNative(plan, config, match[1]) ?
            `reference ${match[1]} points to a native loopback process unreachable from Compose.` :
            `reference ${match[1]} has no shared effective Compose network.`);
        }
      }
    }
    const profileEnvironment = node.kind === "service" ? resolveValues(profile.environment ?? {}, nodeGenerated, nodeGenerated, `profiles.${plan.profile}.environment`) : environment;
    const nodeEnvironment = resolveValues(spec.env ?? {},
      { values: { ...profileEnvironment.values, ...nativeBind }, checked: { ...profileEnvironment.checked, ...nativeBind } },
      { values: { ...nodeGenerated.values, ...nativeBind }, checked: { ...nodeGenerated.checked, ...nativeBind } }, `${field}.env`);
    const readinessEnvironment = node.kind === "service" ?
      resolveValues(spec.env ?? {}, environment, checkedGenerated, `${field}.env`) : nodeEnvironment;
    const lookup = (key: string): [string, string] => {
      if (!Object.prototype.hasOwnProperty.call(nodeEnvironment.values, key)) invalid(field, `missing reference ${key}.`);
      return [nodeEnvironment.values[key], nodeEnvironment.checked[key]];
    };
    const argv = (item: string, location: string): [string, string] => {
      const [value, checked] = expand(item, location, lookup);
      if (value.length === 0) invalid(location, "argv value cannot be empty.");
      return [value, checked];
    };
    const commandPairs = processSpec?.command?.map((item, index) => argv(item, `${field}.command[${index}]`));
    if (commandPairs) rejectCredentialVector(commandPairs.map((pair) => pair[1]), `${field}.command`);
    const command = commandPairs?.map((pair) => pair[0]);
    const scriptPair = processSpec?.script !== undefined ? argv(processSpec.script, `${field}.script`) : undefined;
    if (scriptPair) rejectCredentialVector([scriptPair[1]], `${field}.script`);
    const script = scriptPair?.[0];
    const healthLookup = (key: string): [string, string] => {
      if (!Object.prototype.hasOwnProperty.call(readinessEnvironment.values, key)) invalid(field, `missing reference ${key}.`);
      return [readinessEnvironment.values[key], readinessEnvironment.checked[key]];
    };
    const healthPairs = spec.health?.type === "command" ? spec.health.command.map((item, index): [string, string] => {
      const location = `${field}.health.command[${index}]`;
      const [value, checked] = expand(item, location, healthLookup);
      if (!value.length) invalid(location, "argv value cannot be empty.");
      return [value, checked];
    }) : undefined;
    if (healthPairs) rejectCredentialVector(healthPairs.map((pair) => pair[1]), `${field}.health.command`);
    const healthCommand = healthPairs?.map((pair) => pair[0]);
    try {
      if (processSpec) createProcessEnvironment({ ...processSpec, env: nodeEnvironment.values });
      else createComposeEnvironment({ ...config.services![node.name], env: nodeEnvironment.values });
    } catch (error) { invalid(field, error instanceof Error ? error.message : "environment keys collide after case folding."); }
    nodes[node.name] = { environment: nodeEnvironment.values, readinessEnvironment: readinessEnvironment.values, ...(healthUrls.has(node.name) ? { healthUrl: healthUrls.get(node.name) } : {}), ...(command ? { command } : {}), ...(script ? { script } : {}), ...(healthCommand ? { healthCommand } : {}) };
  }
  return { ownerId, generated, environment: environment.values, directUrls, composeUrls, nodes };
}

function producerIsNative(plan: LifecyclePlan, config: DevFnConfig, key: string): boolean {
  return plan.nodes.some((node) => node.kind === "process" &&
    (config.processes?.[node.name]?.ports ?? []).some((port) => `DEVFN_URL_${normalized(port)}` === key));
}
