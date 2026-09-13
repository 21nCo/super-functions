import type { ActionContract, Provider, Action } from "plugfn";
/** Explicit reviewed action lists; unlisted actions keep their existing/unknown contracts. */
export function declareContracts(
  provider: Provider,
  options: {
    reads: string[];
    writes: string[];
    readScopes: string[];
    writeScopes: string[];
    pagination?: Record<string, ActionContract["pagination"]>;
    resources?: ActionContract["resources"];
  },
) {
  for (const [names, effect, scopes] of [
    [options.reads, "read", options.readScopes],
    [options.writes, "write", options.writeScopes],
  ] as const) {
    for (const name of names) {
      const action = (provider.actions as Record<string, Action>)[name];
      if (!action)
        throw new Error(`Missing reviewed action ${provider.name}.${name}`);
      action.contract = {
        version: "1.0.0",
        effect,
        requiredScopes: scopes,
        resources: options.resources ?? [],
        sensitiveKeys: [
          "body",
          "text",
          "content",
          "description",
          "email",
          "properties",
          "children",
          "filter",
          "query",
        ],
        pagination: options.pagination?.[name] ?? { kind: "none" },
        retry: effect === "read" ? "safe" : "never",
      };
    }
  }
}
