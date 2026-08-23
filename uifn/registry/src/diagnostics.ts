export interface RegistryDiagnostic {
  code: string;
  message: string;
  path?: string;
  value?: unknown;
}

const LOCAL_PATH_PATTERN = /(?:\/(?:tmp|private|home|workspace|var|opt|Volumes)\/[^\s"',)]+|[A-Za-z]:\\[^\s"',)]+)/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_KEY_PATTERN = /(token|secret|password|apiKey|uploadUrl)/i;

function redactString(value: string): string {
  return value
    .replace(LOCAL_PATH_PATTERN, '[REDACTED_LOCAL_PATH]')
    .replace(EMAIL_PATTERN, '[REDACTED_PII]');
}

export function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  return value;
}

export function redactDiagnostic<T extends Record<string, unknown>>(diagnostic: T): T {
  return Object.fromEntries(
    Object.entries(diagnostic).map(([key, value]) => [key, redactValue(key, value)])
  ) as T;
}
