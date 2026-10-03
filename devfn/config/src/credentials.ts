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
  // Compact qualified names appear in uppercase environment keys and camel
  // case flags (DBKEY, DBAUTH, dbAuth). Keep lowercase words such as monkey.
  if (normalized.length > 3 && ["pwd", "key", "auth"].some((key) => normalized.endsWith(key)) &&
      (name === name.toUpperCase() || /[a-z][A-Z]/.test(name))) return true;
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
