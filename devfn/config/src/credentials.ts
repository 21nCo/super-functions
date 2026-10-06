/** Shared grammar for environment keys, argv flags and URL parameters. */
const CREDENTIAL_ALIASES = new Set([
  "accesskey", "accesskeyid", "accesstoken", "apikey", "auth", "authkey", "authorization", "authtoken",
  "bearer", "clientsecret", "cookie", "cred", "credential", "credentials", "creds", "key", "passwd", "password",
  "pass", "passcode", "passphrase", "privatekey", "pwd", "refreshtoken", "secret", "secretkey", "sessionid", "sessiontoken",
  "sig", "signature", "token", "xamzcredential", "xamzsignature", "xgoogcredential", "xgoogsignature",
]);

// Compact names have no word boundary. Support known qualifier + alias pairs;
// otherwise words such as monkey and compass would be false positives.
const COMPACT_QUALIFIERS = new Set([
  "api", "app", "auth", "aws", "client", "db", "database", "google", "oauth", "pg", "server", "service", "session", "user", "xamz", "xgoog",
]);

// These suffixes identify credentials even with an application-specific
// qualifier that DevFn cannot enumerate (for example GITHUBTOKEN).
// Short ambiguous suffixes such as key, pass and sig still require a known
// qualifier or a word boundary, so MONKEY and COMPASS remain ordinary names.
const UNAMBIGUOUS_SUFFIXES = [
  "password", "passwd", "passphrase", "passcode", "secret", "token", "credential", "credentials",
  "apikey", "accesskey",
  "privatekey", "sessionid", "sessiontoken", "authorization",
];

function words(name: string): string[] {
  // Numbered copies of a credential field retain the field's meaning.
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/).map((word) => word.replace(/[0-9]+$/, "").toLowerCase()).filter(Boolean);
}

function compactCredential(name: string, qualifiers = 0): boolean {
  if (qualifiers > 0 && CREDENTIAL_ALIASES.has(name)) return true;
  if (qualifiers === 3) return false;
  for (const qualifier of COMPACT_QUALIFIERS) {
    if (name.startsWith(qualifier) && name.length > qualifier.length && compactCredential(name.slice(qualifier.length), qualifiers + 1)) return true;
    if (name.endsWith(qualifier) && name.length > qualifier.length && compactCredential(name.slice(0, -qualifier.length), qualifiers + 1)) return true;
  }
  return false;
}

/** Credential names are aliases delimited by separators or case boundaries,
 * or documented compact qualifier/alias pairs. */
export function isCredentialKey(name: string): boolean {
  const parts = words(name);
  for (let start = 0; start < parts.length; start += 1) {
    for (let end = start + 1; end <= Math.min(parts.length, start + 3); end += 1) {
      if (CREDENTIAL_ALIASES.has(parts.slice(start, end).join(""))) return true;
    }
  }
  const compact = parts.join("");
  return compactCredential(compact) || UNAMBIGUOUS_SUFFIXES.some((suffix) => compact.length > suffix.length && compact.endsWith(suffix));
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
