// Node 18 has Web Crypto in node:crypto before exposing it on globalThis.
const nodeRandomUUID =
  typeof process !== "undefined" && process.versions?.node
    ? (await import("node:crypto")).randomUUID
    : undefined;

export function secureRandomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  if (nodeRandomUUID) return nodeRandomUUID();
  throw new Error("Cryptographic randomUUID is required for identifiers");
}
