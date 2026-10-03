import { customDomainsFor } from "./config.mjs";
import { readSingleInventory, readDnsInventory, readRulesetInventory } from "./inventory.mjs";

function assertApprovedTarget(target) {
  const approved = customDomainsFor(target.environment, [target.product])[0];
  if (!approved || Object.keys(approved).some((key) => approved[key] !== target[key])) {
    throw new Error("Unapproved docs Custom Domain target");
  }
}

function assertZoneOwner(zone, target) {
  if (zone?.id !== target.zoneId || zone.name !== target.zoneName || zone.status !== "active" ||
      zone.type !== "full" || zone.account?.id !== target.accountId) {
    throw new Error("Docs Custom Domain zone/account is not the approved active owner");
  }
}

function assertRows(rows, fields) {
  if (rows.some((row) => fields.some((field) => typeof row[field] !== "string" || !row[field]))) {
    throw new Error("Incomplete docs ownership inventory row");
  }
}

function existingDomain(domains, target, hostname) {
  if (domains.some((domain) => domain.service === target.script && domain.hostname.toLowerCase() !== hostname)) {
    throw new Error("Docs Worker already serves another hostname; preserve its deployment ownership");
  }
  const existing = domains.filter((domain) => domain.hostname.toLowerCase() === hostname);
  if (existing.length > 1 || existing.some((domain) => domain.service !== target.script ||
      domain.zone_id !== target.zoneId || domain.environment !== "production")) {
    throw new Error(`Docs Custom Domain is owned by another service: ${hostname}`);
  }
  return existing.length === 1;
}

function assertDnsOwner(dns, existing, target, matchesHost) {
  const hostname = target.hostname;
  const relevant = dns.filter((record) => matchesHost(record.name) ||
    (record.type === "NS" && record.name.toLowerCase() !== target.zoneName && hostname.endsWith(`.${record.name.toLowerCase()}`)));
  // Existing matching Custom Domains already own their proxied address records.
  // A new attachment must never replace records, even a seemingly harmless CNAME.
  if (relevant.some((record) => !existing || record.name.toLowerCase() !== hostname ||
      !["A", "AAAA"].includes(record.type) || record.proxied !== true)) {
    throw new Error(`Conflicting docs DNS ownership: ${hostname}`);
  }
}

function assertRoutingOwner(routes, rulesets, pageRules, target, matchesHost) {
  if (routes.some((route) => route.script === target.script || matchesHost(route.pattern)) ||
      pageRules.some((rule) => rule.status !== "disabled" && rule.targets.some((entry) => matchesHost(entry.constraint.value))) ||
      rulesets.some((ruleset) => ruleset.kind !== "managed" && /^(http_request_|http_response_)/.test(ruleset.phase))) {
    throw new Error(`Conflicting docs route/ruleset ownership: ${target.hostname}`);
  }
}

// Read-only guard for a later deployment, not permission to attach a hostname.
export async function verifyCustomDomainOwnership(target, { accountId, token, fetchImpl = fetch }) {
  assertApprovedTarget(target);
  if (!token || accountId !== target.accountId) {
    throw new Error("Docs Custom Domain requires a token and the approved CLOUDFLARE_ACCOUNT_ID");
  }

  async function get(pathname) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4${pathname}`, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Docs ownership read failed (${response.status})`);
    const payload = await response.json();
    if (payload.success !== true) throw new Error("Docs ownership read was denied");
    return payload;
  }

  const zone = (await get(`/zones/${target.zoneId}`)).result;
  assertZoneOwner(zone, target);
  const dns = await readDnsInventory(get, `/zones/${target.zoneId}/dns_records`);
  const domains = await readSingleInventory(get, `/accounts/${target.accountId}/workers/domains`);
  const routes = await readSingleInventory(get, `/zones/${target.zoneId}/workers/routes`);
  const rulesets = await readRulesetInventory(get, `/zones/${target.zoneId}/rulesets`);
  const pageRules = await readSingleInventory(get, `/zones/${target.zoneId}/pagerules`);
  for (const [rows, fields] of [[dns, ["name", "type"]], [domains, ["hostname", "service", "zone_id", "environment"]],
    [routes, ["pattern"]], [rulesets, ["kind", "phase"]], [pageRules, ["status"]]]) {
    assertRows(rows, fields);
  }
  const hostname = target.hostname.toLowerCase();
  const matchesHost = (pattern) => {
    const host = pattern.split("://").at(-1).split(/[/?#]/)[0].toLowerCase();
    const escaped = host.replace(/[.+?^${}()|[\]\\]/g, String.raw`\$&`).replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(hostname);
  };
  const existing = existingDomain(domains, target, hostname);
  assertDnsOwner(dns, existing, target, matchesHost);
  assertRoutingOwner(routes, rulesets, pageRules, target, matchesHost);
  return { hostname, existing };
}

export function customDomainPublication(target) {
  assertApprovedTarget(target);
  return {
    path: `/accounts/${target.accountId}/workers/scripts/${target.script}/domains/records`,
    body: {
      override_scope: false,
      override_existing_origin: false,
      override_existing_dns_record: false,
      origins: [{ hostname: target.hostname, zone_id: target.zoneId }],
    },
  };
}

export async function attachCustomDomain(target, options) {
  // Recheck after uploading the Worker. The server-side no-override flags also
  // refuse competing origin/DNS ownership appearing after this snapshot.
  await verifyCustomDomainOwnership(target, options);
  const publication = customDomainPublication(target);
  const response = await (options.fetchImpl ?? fetch)(`https://api.cloudflare.com/client/v4${publication.path}`, {
    method: "PUT",
    signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
    body: JSON.stringify(publication.body),
  });
  if (!response.ok || (await response.json()).success !== true) {
    throw new Error("Docs Worker uploaded but Custom Domain attachment failed; no ownership override requested");
  }
}
