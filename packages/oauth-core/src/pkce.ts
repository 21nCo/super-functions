import { createHash, randomBytes } from "node:crypto";

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

export function generateStateId(prefix = "st"): string {
  return `${prefix}_${base64UrlEncode(randomBytes(32))}`;
}

export function generateNonce(prefix = "nonce"): string {
  return `${prefix}_${base64UrlEncode(randomBytes(32))}`;
}

export function generatePkcePair(verifierEntropyBytes = 64): PkcePair {
  const codeVerifier = base64UrlEncode(randomBytes(verifierEntropyBytes));
  const codeChallenge = base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256"
  };
}

function base64UrlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
