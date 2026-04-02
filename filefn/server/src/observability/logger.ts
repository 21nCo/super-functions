export interface LogContext {
  requestId?: string;
  fileId?: string;
  uploadSessionId?: string;
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

const REDACT_PATTERNS = [
  /https?:\/\/[^\s"']+\?[^\s"']*(?:X-Amz-Signature|Signature|sig|token|key)=[^\s"'&]+/gi,
  /[?&](?:X-Amz-Signature|Signature|sig|token|key)=[^\s"'&]+/gi,
  /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
  /upls_live_[A-Za-z0-9\-_]+/g,
  /shr_live_[A-Za-z0-9\-_]+/g,
  /[A-Za-z0-9\-_]{32,}/g,
];

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

function isSafeValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return true;
  if (['requestId', 'fileId', 'uploadSessionId', 'versionId', 'permissionId'].includes(key)) {
    return SAFE_ID_PATTERN.test(value);
  }
  return true;
}

function shouldRedactKey(lowerKey: string): boolean {
  return (
    lowerKey.includes('token') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('password') ||
    lowerKey.includes('signedurl') ||
    lowerKey.includes('signed_url') ||
    lowerKey.includes('signature') ||
    lowerKey.includes('authorization') ||
    lowerKey.includes('credential') ||
    lowerKey.includes('cookie')
  );
}

function redactStringValue(key: string, value: string): string {
  let redacted = value;
  for (const pattern of REDACT_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  if (redacted !== value && /^https?:\/\//i.test(value)) {
    return '[REDACTED]';
  }
  if (!isSafeValue(key, redacted)) {
    return '[REDACTED]';
  }
  return redacted;
}

function redactValue(key: string, value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  const lowerKey = key.toLowerCase();
  if (shouldRedactKey(lowerKey)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactStringValue(key, value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') {
        return redactStringValue(key, item);
      }
      if (item && typeof item === 'object') {
        return redactSecrets(item as LogContext);
      }
      return item;
    });
  }

  if (typeof value === 'object') {
    return redactSecrets(value as LogContext);
  }

  return value;
}

function redactSecrets(context: LogContext): LogContext {
  const result: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    const redactedValue = redactValue(key, value);
    if (redactedValue !== undefined) {
      result[key] = redactedValue;
    }
  }

  return result;
}

export interface LoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  output?: (level: string, message: string, context: LogContext) => void;
}

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = 'info', output } = options;
  const minLevel = LOG_LEVELS[level];

  function log(logLevel: keyof typeof LOG_LEVELS, message: string, context: LogContext = {}): void {
    if (LOG_LEVELS[logLevel] < minLevel) return;

    const safeContext = redactSecrets(context);
    const timestamp = new Date().toISOString();

    if (output) {
      output(logLevel, message, { timestamp, ...safeContext });
    } else {
      const logFn = logLevel === 'error' ? console.error : logLevel === 'warn' ? console.warn : console.log;
      logFn(JSON.stringify({ timestamp, level: logLevel, message, ...safeContext }));
    }
  }

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
  };
}

export { redactSecrets };
