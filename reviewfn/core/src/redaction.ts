const keyPattern = /(token|secret|password|authorization|api[-_]?key|cookie)/i;

export function collectSecrets(environment: NodeJS.ProcessEnv, explicit: readonly string[] = []): string[] {
  const values = Object.entries(environment).filter(([key, value]) => keyPattern.test(key) && Boolean(value)).map(([, value]) => value as string);
  return [...new Set([...explicit, ...values])].filter((value) => value.length >= 4).sort((a, b) => b.length - a.length);
}

export function redactText(input: string, secrets: readonly string[]): string {
  let output = input;
  for (const secret of [...new Set(secrets)].filter(Boolean).sort((a, b) => b.length - a.length)) output = output.split(secret).join("[REDACTED]");
  output = output.replace(/\b(Bearer|token)\s+[A-Za-z0-9._~+\/-]{8,}/gi, "$1 [REDACTED]");
  output = output.replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, "[REDACTED]");
  return output;
}

/** Redact JSON values and keys without corrupting JSON syntax. Exact scalar credentials become redaction strings. */
export function redactJson<T>(input: T, secrets: readonly string[]): T {
  if ((input === null || typeof input === "number" || typeof input === "boolean") && secrets.some(secret => secret && secret === String(input))) return "[REDACTED]" as T;
  if (typeof input === "string") return redactText(input, secrets) as T;
  if (Array.isArray(input)) return input.map(value => redactJson(value, secrets)) as T;
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, value]) => [redactText(key, secrets), redactJson(value, secrets)])) as T;
  return input;
}
