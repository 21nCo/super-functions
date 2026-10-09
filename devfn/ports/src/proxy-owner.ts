import { processBirthSignature, processExists } from "@devfn/processes";

export interface ProxyOwner { pid: number; birthSignature?: string }

export function parseProxyOwner(value: string): ProxyOwner {
  const owner: unknown = JSON.parse(value);
  if (!owner || typeof owner !== "object" || !Number.isInteger((owner as ProxyOwner).pid) ||
    (owner as ProxyOwner).pid <= 0 ||
    ("birthSignature" in owner && (typeof owner.birthSignature !== "string" || owner.birthSignature.length === 0))) {
    throw new Error("Invalid proxy owner record.");
  }
  return owner as ProxyOwner;
}

export async function proxyOwnerStatus(owner: ProxyOwner): Promise<"active" | "dead" | "identity-mismatch" | "unverified"> {
  if (!processExists(owner.pid)) return "dead";
  if (!owner.birthSignature) return "unverified";
  const current = await processBirthSignature(owner.pid);
  if (!current) return "unverified";
  return current === owner.birthSignature ? "active" : "identity-mismatch";
}
