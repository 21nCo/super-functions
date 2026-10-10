export type RuntimeAdapter =
  | "command"
  | "npm"
  | "pnpm"
  | "turbo"
  | "wrangler"
  | "xcode"
  | "extfn";

export type HealthCheck =
  | { type: "http"; url?: string; port?: string; path?: string; expectedStatus?: number; timeoutMs?: number }
  | { type: "tcp"; port: string; timeoutMs?: number }
  | { type: "command"; command: string[]; timeoutMs?: number }
  | { type: "log"; pattern: string; timeoutMs?: number };

export interface PortSpec {
  protocol?: "tcp" | "udp";
  preferred?: number;
  range?: [number, number];
  exact?: boolean;
  ephemeral?: boolean;
  exposure?: "loopback" | "public";
  internal?: number;
  block?: string;
  env?: string;
}

export interface ProcessSpec {
  adapter: RuntimeAdapter;
  exposure?: "local" | "public";
  command?: string[];
  script?: string;
  cwd?: string;
  env?: Record<string, string>;
  envAllowlist?: string[];
  secretEnv?: string[];
  ports?: string[];
  dependsOn?: string[];
  health?: HealthCheck;
  shutdownTimeoutMs?: number;
}

export interface ComposeServiceSpec {
  adapter: "compose";
  file?: string;
  service: string;
  projectName?: string;
  ports?: Record<string, number>;
  dependsOn?: string[];
  health?: HealthCheck;
  persistent?: boolean;
  env?: Record<string, string>;
  envAllowlist?: string[];
  secretEnv?: string[];
}

export interface ProfileSpec {
  processes?: string[];
  services?: string[];
  environment?: Record<string, string>;
  proxy?: boolean;
}

/**
 * A proxy route. Validation accepts two variants: a .localhost route
 * (optional `hostname` template and `tls`) or a registered-domain route
 * (`domain`, optional `host`, TLS from the machine registration). `domain`
 * excludes `hostname` and `tls`; `host` requires `domain`.
 */
export interface HostnameSpec {
  target: string;
  /** .localhost hostname template using {project} and {instance}; excludes domain. */
  hostname?: string;
  /** Machine-registered domain; a manifest cannot create the registration. */
  domain?: string;
  /** Registered-domain host label; defaults to the route key. Requires domain. */
  host?: string;
  /** Absolute URL path; defaults to "/". */
  path?: string;
  /** Defaults to "prefix". */
  match?: "exact" | "prefix";
  /** Strip the path prefix upstream; requires a non-root prefix path. Defaults to false. */
  stripPrefix?: boolean;
  /** .localhost routes only; defaults to "off". */
  tls?: "off" | "internal";
  profiles?: string[];
}

export interface RuntimePrerequisite {
  command: string;
  version?: string;
  optional?: boolean;
  profiles?: string[];
}

export interface EnvironmentOutput {
  path: string;
  format?: "dotenv" | "json";
  mode?: number;
}

export interface DevFnConfig {
  version: 1;
  project: { id: string; name?: string };
  defaultProfile?: string;
  runtimeDir?: string;
  ports?: Record<string, PortSpec>;
  processes?: Record<string, ProcessSpec>;
  services?: Record<string, ComposeServiceSpec>;
  profiles: Record<string, ProfileSpec>;
  hostnames?: Record<string, HostnameSpec>;
  prerequisites?: RuntimePrerequisite[];
  environmentOutputs?: EnvironmentOutput[];
  policy?: string;
}

export interface PortPolicyEntry {
  name: string;
  port?: number;
  range?: [number, number];
  kind: "protected" | "preferred" | "excluded";
  project?: string;
  description?: string;
}

export interface DevFnPolicy {
  version: 1;
  fallbackRange?: [number, number];
  hostnameSuffix?: string;
  ports?: PortPolicyEntry[];
}

export interface DetectionFinding {
  kind: "package-manager" | "process" | "compose" | "wrangler" | "xcode" | "extension";
  confidence: "confirmed" | "proposed";
  source: string;
  detail: string;
}

export interface DiscoveryResult {
  root: string;
  findings: DetectionFinding[];
  config: DevFnConfig;
}
