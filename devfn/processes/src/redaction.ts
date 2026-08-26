export interface StreamingRedactor { push(chunk: string): void; end(): void }

export function createStreamingRedactor(values: readonly string[], write: (value: string) => void): StreamingRedactor {
  const secrets = [...new Set(values)].filter(Boolean).sort((a, b) => b.length - a.length);
  let buffer = "";
  const longest = Math.max(1, ...secrets.map((secret) => secret.length));
  const flush = (ending: boolean) => {
    while (buffer.length >= (ending ? 1 : longest)) {
      const match = secrets.find((secret) => buffer.startsWith(secret));
      if (match) { write("[REDACTED]"); buffer = buffer.slice(match.length); }
      else { write(buffer[0]); buffer = buffer.slice(1); }
    }
  };
  return {
    push(chunk) { buffer += chunk; flush(false); },
    end() { flush(true); },
  };
}
