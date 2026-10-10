import { processIdentityStatus } from "@devfn/processes";

export interface ProxyOwner { pid: number; birthSignature?: string; startedAt?: string }

export function parseProxyOwner(value: string): ProxyOwner {
  const owner: unknown = JSON.parse(value);
  if (!owner || typeof owner !== "object" || !Number.isSafeInteger((owner as ProxyOwner).pid) ||
    (owner as ProxyOwner).pid <= 0 ||
    ("birthSignature" in owner && (typeof owner.birthSignature !== "string" || owner.birthSignature.length === 0)) ||
    ("startedAt" in owner && typeof owner.startedAt !== "string")) {
    throw new Error("Invalid proxy owner record.");
  }
  return owner as ProxyOwner;
}

export async function proxyOwnerStatus(owner: ProxyOwner): Promise<"active" | "dead" | "identity-mismatch" | "unverified"> {
  const status = await processIdentityStatus(owner.pid, owner.birthSignature, owner.startedAt);
  if (status === "running") return "active";
  return status === "exited" ? "dead" : status;
}
