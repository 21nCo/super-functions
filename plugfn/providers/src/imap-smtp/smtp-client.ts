import nodemailer, { type Transporter } from 'nodemailer';

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
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'PROVIDER_DELIVERY_FAILED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(
    code: 'PROVIDER_POLICY_BLOCKED' | 'PROVIDER_DELIVERY_FAILED' | 'VALIDATION_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'SmtpClientError';
    this.code = code;
    this.status =
      code === 'PROVIDER_POLICY_BLOCKED' ? 403 : code === 'PROVIDER_DELIVERY_FAILED' ? 502 : 400;
  }
}

export class SmtpClient {
  private readonly config: Required<SmtpClientConfig>;
  private readonly transport: Transporter;

  constructor(config: SmtpClientConfig) {
    this.config = resolveSmtpConfig(config);
    this.transport = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls && this.config.port === 465,
      requireTLS: this.config.tls && this.config.port !== 465,
      ignoreTLS: !this.config.tls,
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
    });
  }

  async connect(): Promise<SmtpConnectionResult> {
    enforceSecureTransport(this.config.tls, this.config.explicitInsecureOverride);
    try {
      await this.transport.verify();
    } catch {
      throw new SmtpClientError('PROVIDER_DELIVERY_FAILED', 'smtp connection failed');
    }
    return {
      smtpConnected: true,
      tls: this.config.tls,
      host: this.config.host,
      port: this.config.port,
    };
  }

  async send(request: SmtpSendRequest): Promise<SmtpSendResult> {
    enforceSecureTransport(this.config.tls, this.config.explicitInsecureOverride);
    validateSendRequest(request);

    let messageId: string;
    try {
      const result = await this.transport.sendMail({
        from: request.from,
        to: request.to,
        cc: request.cc,
        bcc: request.bcc,
        subject: request.subject,
        text: request.bodyText,
        html: request.bodyHtml,
      });
      messageId = result.messageId;
    } catch {
      throw new SmtpClientError('PROVIDER_DELIVERY_FAILED', 'smtp delivery failed');
    }

    return {
      queued: true,
      messageId,
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
