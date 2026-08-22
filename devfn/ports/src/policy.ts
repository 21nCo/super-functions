import type { DevFnPolicy } from "@devfn/config";

function expand(entry: { port?: number; range?: [number, number] }): number[] {
  if (entry.port !== undefined) return [entry.port];
  if (!entry.range) return [];
  return Array.from({ length: entry.range[1] - entry.range[0] + 1 }, (_, index) => entry.range![0] + index);
}

export function resolvePolicy(policy: DevFnPolicy | null, projectId: string): { fallbackRange?: [number, number]; preferredRange?: [number, number]; protectedPorts: Set<number>; excludedPorts: Set<number> } {
  const protectedPorts = new Set<number>();
  const excludedPorts = new Set<number>();
  let preferredRange: [number, number] | undefined;
  for (const entry of policy?.ports ?? []) {
    if (entry.project && entry.project !== projectId) continue;
    if (entry.kind === "protected") expand(entry).forEach((port) => protectedPorts.add(port));
    if (entry.kind === "excluded") expand(entry).forEach((port) => excludedPorts.add(port));
    if (entry.kind === "preferred" && !preferredRange) preferredRange = entry.range ?? (entry.port === undefined ? undefined : [entry.port, entry.port]);
  }
  return { ...(policy?.fallbackRange ? { fallbackRange: policy.fallbackRange } : {}), ...(preferredRange ? { preferredRange } : {}), protectedPorts, excludedPorts };
}

export function renderPolicyInventory(policy: DevFnPolicy | null): string {
  const cell = (value: unknown): string => String(value ?? "").replaceAll("|", "\\|").replace(/\r?\n/g, " ");
  return [
    "## Organization port policy",
    "",
    "| Name | Kind | Port or range | Project | Description |",
    "| --- | --- | --- | --- | --- |",
    ...(policy?.ports ?? []).map((entry) => `| ${cell(entry.name)} | ${cell(entry.kind)} | ${cell(entry.port ?? `${entry.range?.[0]}-${entry.range?.[1]}`)} | ${cell(entry.project ?? "shared")} | ${cell(entry.description)} |`),
    "",
  ].join("\n");
}
