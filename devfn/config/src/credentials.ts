/** Identify credential-bearing names in environment keys, flags, and URL parameters. */
const CREDENTIAL_KEYS = new Set([
  "accesskey", "accesskeyid", "accesstoken", "apikey", "auth", "authkey", "authorization", "authtoken",
  "bearer", "clientsecret", "cookie", "credential", "credentials", "key", "passwd", "password",
  "privatekey", "pwd", "refreshtoken", "secret", "secretkey", "sessionid", "sessiontoken",
  "sig", "signature", "token", "xamzcredential", "xamzsignature", "xgoogcredential", "xgoogsignature",
]);

export function isCredentialKey(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (CREDENTIAL_KEYS.has(normalized)) return true;
  // Qualified names include application prefixes and suffixes. Short labels
  // stay on token boundaries so ordinary names such as monkey remain valid.
  if ([...CREDENTIAL_KEYS].some((key) => key.length >= 5 && normalized.includes(key))) return true;
  // Compact qualified names can also cross an acronym/title-case boundary
  // (DBKey), or use a lowercase database prefix (dbkey). Keep ordinary words
  // such as monkey from being classified solely by their final letters.
  const compact = name.replace(/[^a-z0-9]/gi, "");
  for (const suffix of ["pwd", "key", "auth"]) {
    if (compact.length <= suffix.length || !compact.toLowerCase().endsWith(suffix)) continue;
    const prefix = compact.slice(0, -suffix.length);
    const tail = compact.slice(-suffix.length);
    if (suffix !== "key" || prefix.toLowerCase() === "db" ||
        prefix === prefix.toUpperCase() || tail[0] === tail[0].toUpperCase()) return true;
  }
  return name.toLowerCase().split(/[^a-z0-9]+/).some((part) => CREDENTIAL_KEYS.has(part));
}

/** Reject keys that would alias on case-insensitive process environments. */
export function assertEnvironmentKeyCasing(...groups: ReadonlyArray<Iterable<string>>): void {
  const seen = new Map<string, string>();
  for (const group of groups) for (const key of group) {
    const folded = key.toUpperCase();
    const previous = seen.get(folded);
    if (previous && previous !== key) throw new Error(`Environment key ${key} collides with ${previous} after case folding.`);
    seen.set(folded, key);
  }
}
