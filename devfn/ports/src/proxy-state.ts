import path from "node:path";

// Kept in ports so both the domain registry and port-claim recovery can
// validate proxy state without importing the proxy package back into ports.
export interface PersistedProxyRoute {
  id: string; instanceId: string; hostname: string; targetHost: "127.0.0.1" | "::1";
  targetPort: number; tls: "off" | "internal" | "certificate"; updatedAt: string;
  path?: string; match?: "exact" | "prefix"; stripPrefix?: boolean;
  registeredDomain?: string; projectId?: string; repositoryIdentity?: string;
  certificateFile?: string; keyFile?: string; certificateDigest?: string;
}

const hostnamePattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const routePathPattern = /^\/[A-Za-z0-9._~!$&'()+,;=:@/-]*$/;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function parsePersistedProxyRoutes(value: unknown): PersistedProxyRoute[] {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1 ||
    !Array.isArray((value as { routes?: unknown }).routes)) throw new Error("Invalid proxy route state.");
  const routes = (value as { routes: unknown[] }).routes;
  const ids = new Set<string>();
  const paths = new Set<string>();
  const hosts = new Map<string, { owner: string; tls: string }>();
  for (const value of routes) {
    if (!value || typeof value !== "object") throw new Error("Invalid proxy route.");
    const route = value as Record<string, unknown>;
    if (!nonempty(route.id) || !nonempty(route.instanceId) || !nonempty(route.hostname) ||
      route.hostname.length > 253 || !hostnamePattern.test(route.hostname) ||
      (route.targetHost !== "127.0.0.1" && route.targetHost !== "::1") ||
      !Number.isInteger(route.targetPort) || (route.targetPort as number) < 1 || (route.targetPort as number) > 65535 ||
      !["off", "internal", "certificate"].includes(route.tls as string) ||
      !nonempty(route.updatedAt)) throw new Error("Invalid proxy route.");
    const routePath = route.path ?? "/";
    const match = route.match ?? "prefix";
    if (typeof routePath !== "string" || !routePathPattern.test(routePath) || routePath.includes("//") ||
      routePath.split("/").some((part) => part === "." || part === "..") ||
      !["exact", "prefix"].includes(match as string) ||
      (route.stripPrefix !== undefined && typeof route.stripPrefix !== "boolean") ||
      (route.stripPrefix === true && (match !== "prefix" || routePath === "/"))) throw new Error("Invalid proxy path.");
    if (route.registeredDomain !== undefined &&
      (!nonempty(route.registeredDomain) || !hostnamePattern.test(route.registeredDomain) ||
        !(route.hostname === route.registeredDomain || route.hostname.endsWith(`.${route.registeredDomain}`)) ||
        !nonempty(route.projectId) || !nonempty(route.repositoryIdentity))) throw new Error("Invalid registered route.");
    if (!route.hostname.endsWith(".localhost") && route.registeredDomain === undefined) throw new Error("Unregistered route hostname.");
    if (route.tls === "certificate") {
      if (!nonempty(route.certificateFile) || !path.isAbsolute(route.certificateFile) ||
        !nonempty(route.keyFile) || !path.isAbsolute(route.keyFile)) throw new Error("Invalid certificate route.");
    } else if (route.certificateFile !== undefined || route.keyFile !== undefined || route.certificateDigest !== undefined) {
      throw new Error("Unexpected certificate route fields.");
    }
    if (route.certificateDigest !== undefined && (typeof route.certificateDigest !== "string" || !/^[a-f0-9]{64}$/.test(route.certificateDigest))) throw new Error("Invalid certificate digest.");
    const hostname = route.hostname.toLowerCase();
    const host = hosts.get(hostname);
    if (ids.has(route.id) || (host && (host.owner !== route.instanceId || host.tls !== route.tls))) throw new Error("Conflicting proxy route.");
    ids.add(route.id);
    hosts.set(hostname, { owner: route.instanceId, tls: route.tls as string });
    const canonicalPath = match === "prefix" ? routePath.replace(/\/$/, "") || "/" : routePath;
    const key = `${hostname}\0${match}\0${canonicalPath.toLowerCase()}`;
    if (paths.has(key)) throw new Error("Ambiguous proxy route.");
    paths.add(key);
  }
  return routes as PersistedProxyRoute[];
}
