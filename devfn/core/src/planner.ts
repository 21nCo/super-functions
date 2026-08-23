import type { DevFnConfig } from "@devfn/config";
import { DevFnError, type LifecyclePlan } from "./types.js";

export function createPlan(config: DevFnConfig, requestedProfile?: string): LifecyclePlan {
  const collision = Object.keys(config.processes ?? {}).find((name) => Object.prototype.hasOwnProperty.call(config.services ?? {}, name));
  if (collision) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Lifecycle node ${collision} cannot be both a process and a service.`);
  const profileName = requestedProfile ?? config.defaultProfile ?? "default";
  const profile = config.profiles[profileName];
  if (!profile) throw new DevFnError("DEVFN_PROFILE_NOT_FOUND", `Profile ${profileName} does not exist.`);
  const selected = new Set([...(profile.processes ?? []), ...(profile.services ?? [])]);
  const expanded = new Set<string>();
  const dependencies = (name: string): string[] => config.processes?.[name]?.dependsOn ?? config.services?.[name]?.dependsOn ?? [];
  const include = (name: string): void => {
    if (!config.processes?.[name] && !config.services?.[name]) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Unknown lifecycle node ${name}.`);
    if (expanded.has(name)) return;
    expanded.add(name);
    if (!selected.has(name)) selected.add(name);
    dependencies(name).forEach(include);
  };
  [...selected].forEach(include);
  if (profile.proxy) {
    for (const hostname of Object.values(config.hostnames ?? {})) {
      if (hostname.profiles && !hostname.profiles.includes(profileName)) continue;
      const owners = [
        ...Object.entries(config.processes ?? {}).filter(([, spec]) => spec.ports?.includes(hostname.target)).map(([name]) => name),
        ...Object.entries(config.services ?? {}).filter(([, spec]) => spec.ports?.[hostname.target] !== undefined).map(([name]) => name),
      ];
      if (owners.length === 0) throw new DevFnError("DEVFN_RUNTIME_INVALID", `Hostname target ${hostname.target} has no lifecycle owner.`);
      const activeOwners = owners.filter((name) => selected.has(name));
      if (activeOwners.length > 1 || (activeOwners.length === 0 && owners.length > 1)) {
        throw new DevFnError("DEVFN_RUNTIME_INVALID", `Hostname target ${hostname.target} has ambiguous lifecycle owners for profile ${profileName}.`);
      }
      include(activeOwners[0] ?? owners[0]);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new DevFnError("DEVFN_DEPENDENCY_CYCLE", `Dependency cycle contains ${name}.`);
    visiting.add(name);
    dependencies(name).forEach(visit);
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  };
  [...selected].sort().forEach(visit);

  const portNames = new Set<string>();
  for (const name of ordered) {
    for (const port of config.processes?.[name]?.ports ?? []) portNames.add(port);
    for (const port of Object.keys(config.services?.[name]?.ports ?? {})) portNames.add(port);
  }
  for (const hostname of Object.values(config.hostnames ?? {})) if (profile.proxy && (!hostname.profiles || hostname.profiles.includes(profileName))) portNames.add(hostname.target);
  return {
    profile: profileName,
    nodes: ordered.map((name) => ({ name, kind: config.processes?.[name] ? "process" : "service", dependencies: dependencies(name) })),
    portNames: [...portNames].sort(),
    proxy: profile.proxy === true,
  };
}
