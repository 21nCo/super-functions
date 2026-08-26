export function parseFilters(argv) {
  const filters = {
    framework: undefined,
    family: undefined,
    profile: undefined,
    slug: undefined,
    route: undefined,
    scope: undefined,
    theme: undefined,
    viewport: undefined,
    maxRoutes: undefined,
    shardIndex: undefined,
    shardCount: undefined,
    routeTimeoutMs: undefined,
    listShards: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [inlineKey, inlineValue] = arg.startsWith("--") && arg.includes("=") ? arg.slice(2).split(/=(.*)/s) : [];
    if (inlineKey) {
      if (inlineKey === "max-routes") filters.maxRoutes = Number(inlineValue);
      else if (inlineKey === "shard-index") filters.shardIndex = Number(inlineValue);
      else if (inlineKey === "shard-count") filters.shardCount = Number(inlineValue);
      else if (inlineKey === "route-timeout-ms") filters.routeTimeoutMs = Number(inlineValue);
      else if (inlineKey === "list-shards") filters.listShards = true;
      else filters[inlineKey] = inlineValue;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "list-shards") {
      filters.listShards = true;
      continue;
    }
    const value = argv[index + 1];
    index += 1;
    if (key === "max-routes") filters.maxRoutes = Number(value);
    else if (key === "shard-index") filters.shardIndex = Number(value);
    else if (key === "shard-count") filters.shardCount = Number(value);
    else if (key === "route-timeout-ms") filters.routeTimeoutMs = Number(value);
    else filters[key] = value;
  }

  return filters;
}

export function routeMatches(route, filters) {
  if (!route.contract) {
    if (route.family !== "scenario") return false;
    if (!route.slug) return false;
    if (filters.family && route.family !== filters.family) return false;
    if (filters.profile && filters.profile !== "layout") return false;
    if (filters.slug && route.slug !== filters.slug) return false;
    if (filters.route && route.path !== filters.route) return false;
    return true;
  }
  if (filters.family && route.family !== filters.family) return false;
  const fixtureProfile = route.fixtureId
    ? route.contract.fixtures.find((fixture) => fixture.id === route.fixtureId)?.profile
    : undefined;
  const effectiveProfile = fixtureProfile ?? route.profile ?? route.contract.qaProfile;
  if (filters.profile && effectiveProfile !== filters.profile) return false;
  if (filters.slug && route.slug !== filters.slug) return false;
  if (filters.route && route.path !== filters.route) return false;
  if (filters.scope === "smoke" && route.fixtureId && route.fixtureId !== "default") return false;
  if (filters.scope === "a11y" && !route.contract.requiredA11y.length) return false;
  if (filters.scope === "visual") {
    if (!route.contract.requiredVisual.length) return false;
    if (route.family === "component" && route.fixtureId !== "themes") return false;
    if ((route.family === "pattern" || route.family === "sf") && route.fixtureId !== "success") return false;
  }
  return true;
}
