import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { withFileLock } from "@devfn/ports";

export interface RegisteredDomain {
  domain: string;
  projectId: string;
  repositoryIdentity: string;
  tls: "internal" | "certificate";
  certificateFile?: string;
  keyFile?: string;
}

interface DomainState { version: 1; domains: RegisteredDomain[] }

export class DomainError extends Error {
  public constructor(public readonly code: "DEVFN_DOMAIN_INVALID" | "DEVFN_DOMAIN_UNREGISTERED" | "DEVFN_DOMAIN_DNS_INVALID" | "DEVFN_DOMAIN_CERT_INVALID" | "DEVFN_DOMAIN_IN_USE", message: string) {
    super(message); this.name = "DomainError";
  }
}

export function normalizeDomain(value: string): string {
  const domain = value.toLowerCase();
  if (value !== domain || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || domain.endsWith(".localhost")) {
    throw new DomainError("DEVFN_DOMAIN_INVALID", "A registered domain must be a lowercase, concrete DNS name outside .localhost.");
  }
  return domain;
}

export function domainContains(domain: string, hostname: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function loopback(address: string): boolean {
  if (isIP(address) === 4) return address.split(".")[0] === "127";
  if (isIP(address) === 6) return address === "::1" || address.toLowerCase() === "0:0:0:0:0:0:0:1" || /^::ffff:127\./i.test(address);
  return false;
}

export async function verifyLocalDns(hostname: string, resolve: typeof lookup = lookup, timeoutMs = 5_000): Promise<void> {
  let answers: Array<{ address: string; family: number }>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    answers = await Promise.race([
      resolve(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS lookup timed out.")), timeoutMs); }),
    ]);
  }
  catch { throw new DomainError("DEVFN_DOMAIN_DNS_INVALID", `DNS resolution failed for ${hostname}.`); }
  finally { if (timer) clearTimeout(timer); }
  if (answers.length === 0 || answers.some((answer) => !loopback(answer.address))) {
    throw new DomainError("DEVFN_DOMAIN_DNS_INVALID", `Every resolved address for ${hostname} must be loopback.`);
  }
}

async function verifyCertificateMaterial(certificateFile: string | undefined, keyFile: string | undefined): Promise<X509Certificate> {
  if (!certificateFile || !keyFile || !path.isAbsolute(certificateFile) || !path.isAbsolute(keyFile)) {
    throw new DomainError("DEVFN_DOMAIN_CERT_INVALID", "Certificate and key must be explicit absolute files.");
  }
  try {
    const certificate = new X509Certificate(await readFile(certificateFile));
    const key = createPrivateKey(await readFile(keyFile));
    if (!certificate.subjectAltName?.split(/,\s*/).some((entry) => entry.startsWith("DNS:"))) {
      throw new Error("Certificate has no DNS subjectAltName.");
    }
    if (!createPublicKey(key).export({ type: "spki", format: "der" }).equals(certificate.publicKey.export({ type: "spki", format: "der" }))) {
      throw new Error("Certificate and key do not match.");
    }
    if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) throw new Error("Certificate is not currently valid.");
    return certificate;
  } catch {
    throw new DomainError("DEVFN_DOMAIN_CERT_INVALID", "Configured certificate or key is invalid.");
  }
}

export async function verifyCertificate(hostname: string, certificateFile: string | undefined, keyFile: string | undefined): Promise<void> {
  const certificate = await verifyCertificateMaterial(certificateFile, keyFile);
  // checkHost accepts a legacy CN when no SAN exists; material validation
  // above requires a DNS SAN before checking each selected route hostname.
  if (!certificate.checkHost(hostname, { subject: "never" })) {
    throw new DomainError("DEVFN_DOMAIN_CERT_INVALID", `Configured certificate cannot serve ${hostname}.`);
  }
}

export async function readRegisteredDomains(stateDir: string): Promise<RegisteredDomain[]> {
  try {
    const state = JSON.parse(await readFile(path.join(stateDir, "domains.json"), "utf8")) as DomainState;
    if (state.version !== 1 || !Array.isArray(state.domains)) throw new Error("Invalid domain registry.");
    for (const entry of state.domains) {
      normalizeDomain(entry.domain);
      if (!entry.projectId || !entry.repositoryIdentity || !["internal", "certificate"].includes(entry.tls)) throw new Error("Invalid domain registry entry.");
      if (entry.tls === "certificate" && (!entry.certificateFile || !entry.keyFile)) throw new Error("Incomplete certificate registration.");
    }
    if (new Set(state.domains.map((entry) => entry.domain)).size !== state.domains.length) throw new Error("Duplicate domain registration.");
    return state.domains;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new DomainError("DEVFN_DOMAIN_INVALID", "The machine domain registry is invalid.");
  }
}

async function writeDomains(stateDir: string, domains: RegisteredDomain[]): Promise<void> {
  const destination = path.join(stateDir, "domains.json");
  const temp = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify({ version: 1, domains }, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, destination);
  } finally { await rm(temp, { force: true }); }
}

export async function registerDomain(stateDir: string, entry: RegisteredDomain, resolve: typeof lookup = lookup): Promise<RegisteredDomain> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const domain = normalizeDomain(entry.domain);
  if (!entry.projectId || !entry.repositoryIdentity || !["internal", "certificate"].includes(entry.tls)) {
    throw new DomainError("DEVFN_DOMAIN_INVALID", "Domain ownership and TLS mode are required.");
  }
  if (entry.tls === "certificate") {
    await verifyCertificateMaterial(entry.certificateFile, entry.keyFile);
  }
  if (entry.tls === "internal" && (entry.certificateFile || entry.keyFile)) throw new DomainError("DEVFN_DOMAIN_INVALID", "Internal TLS cannot include certificate files.");
  await verifyLocalDns(domain, resolve);
  const canonical = { ...entry, domain, repositoryIdentity: await realpath(entry.repositoryIdentity) };
  return await withFileLock(path.join(stateDir, "proxy.lock"), async () => {
    const domains = await readRegisteredDomains(stateDir);
    const existing = domains.find((item) => item.domain === domain);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(canonical)) return existing;
      throw new DomainError("DEVFN_DOMAIN_IN_USE", `Domain ${domain} is already registered.`);
    }
    if (domains.some((item) => domainContains(item.domain, domain) || domainContains(domain, item.domain))) {
      throw new DomainError("DEVFN_DOMAIN_IN_USE", `Domain ${domain} overlaps an existing registration.`);
    }
    await writeDomains(stateDir, [...domains, canonical]);
    return canonical;
  });
}

export async function unregisterDomain(stateDir: string, domain: string, projectId: string, repositoryIdentity: string): Promise<void> {
  normalizeDomain(domain);
  const canonicalRepositoryIdentity = await realpath(repositoryIdentity);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  await withFileLock(path.join(stateDir, "proxy.lock"), async () => {
    const domains = await readRegisteredDomains(stateDir);
    const entry = domains.find((item) => item.domain === domain);
    if (!entry || entry.projectId !== projectId || entry.repositoryIdentity !== canonicalRepositoryIdentity) throw new DomainError("DEVFN_DOMAIN_UNREGISTERED", `Domain ${domain} is not registered to this repository.`);
    for (const file of ["proxy-routes.json", "proxy-routes.pending.json"]) {
      let routes: { version?: number; routes?: Array<{ registeredDomain?: string }> };
      try { routes = JSON.parse(await readFile(path.join(stateDir, file), "utf8")); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new DomainError("DEVFN_DOMAIN_INVALID", "Proxy route state is invalid."); routes = {}; }
      if (routes.routes !== undefined && (routes.version !== 1 || !Array.isArray(routes.routes))) throw new DomainError("DEVFN_DOMAIN_INVALID", "Proxy route state is invalid.");
      if (routes.routes?.some((route) => route.registeredDomain === domain)) throw new DomainError("DEVFN_DOMAIN_IN_USE", `Domain ${domain} still has active routes.`);
    }
    await writeDomains(stateDir, domains.filter((item) => item.domain !== domain));
  });
}
