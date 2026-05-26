export interface SmtpClientConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  tls?: boolean;
  explicitInsecureOverride?: boolean;
}

export interface SmtpConnectionResult {
  smtpConnected: true;
  tls: boolean;
  host: string;
  port: number;
}

export interface SmtpSendRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}

export interface SmtpSendResult {
  queued: true;
  messageId: string;
  tls: boolean;
}

export class SmtpClientError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'SmtpClientError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export class SmtpClient {
  private readonly config: Required<SmtpClientConfig>;

  constructor(config: SmtpClientConfig) {
    this.config = resolveSmtpConfig(config);
  }

  connect(): SmtpConnectionResult {
    enforceSecureTransport(this.config.tls, this.config.explicitInsecureOverride);
    return {
      smtpConnected: true,
      tls: this.config.tls,
      host: this.config.host,
      port: this.config.port,
    };
  }

  send(request: SmtpSendRequest): SmtpSendResult {
    enforceSecureTransport(this.config.tls, this.config.explicitInsecureOverride);
    validateSendRequest(request);

    return {
      queued: true,
      messageId: buildMessageId(this.config.host, request.from, request.subject),
      tls: this.config.tls,
    };
  }
}

function resolveSmtpConfig(config: SmtpClientConfig): Required<SmtpClientConfig> {
  const host = config.host?.trim();
  const username = config.username?.trim();
  const password = config.password?.trim();

  if (!host) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp host is required');
  }
  if (!username) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp username is required');
  }
  if (!password) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp password is required');
  }

  return {
    host,
    port: config.port ?? 465,
    username,
    password,
    tls: config.tls ?? true,
    explicitInsecureOverride: config.explicitInsecureOverride ?? false,
  };
}

function enforceSecureTransport(tls: boolean, explicitInsecureOverride: boolean): void {
  if (!tls && !explicitInsecureOverride) {
    throw new SmtpClientError('PROVIDER_POLICY_BLOCKED', 'insecure transport disabled');
  }
}

function validateSendRequest(request: SmtpSendRequest): void {
  if (!request.from || request.from.trim().length === 0) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp from address is required');
  }
  if (!Array.isArray(request.to) || request.to.length === 0) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp at least one recipient is required');
  }
  if (!request.subject || request.subject.trim().length === 0) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp subject is required');
  }
  if (
    (!request.bodyText || request.bodyText.trim().length === 0) &&
    (!request.bodyHtml || request.bodyHtml.trim().length === 0)
  ) {
    throw new SmtpClientError('VALIDATION_ERROR', 'smtp bodyText or bodyHtml is required');
  }
}

function buildMessageId(host: string, from: string, subject: string): string {
  const entropy = Math.random().toString(36).slice(2, 10);
  const normalizedSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
  const normalizedFrom = from.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
  const normalizedHost = host.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
  return `msg_${normalizedHost}_${normalizedFrom}_${normalizedSubject}_${entropy}`;
}
