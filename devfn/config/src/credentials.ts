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
  // PWD is also commonly written without a separator (DBPWD, dbPwd). KEY is
  // too broad for that rule: MONKEY and similar ordinary names must survive.
  if (normalized.length > 3 && normalized.endsWith("pwd")) return true;
  return name.toLowerCase().split(/[^a-z0-9]+/).some((part) => CREDENTIAL_KEYS.has(part));
}
