// Node 18 has Web Crypto in node:crypto before exposing it on globalThis.
const nodeCrypto =
  typeof process !== "undefined" && process.versions?.node
    ? await import("node:crypto")
    : undefined;

export function secureRandomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  if (nodeCrypto) return nodeCrypto.randomUUID();
  throw new Error("Cryptographic randomUUID is required for identifiers");
}

export async function secureSha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  }
  if (nodeCrypto) return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  throw new Error("Cryptographic SHA-256 is required for cache keys");
}
