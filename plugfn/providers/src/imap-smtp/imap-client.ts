import { ImapFlow } from 'imapflow';
import { validateNormalizedMailMessage, type NormalizedMailMessage } from 'plugfn';

export interface ImapCapabilityMatrix {
  read: boolean;
  search: boolean;
  move: boolean;
  idle: boolean;
}

export interface ImapClientConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  oauth2?: boolean;
  tls?: boolean;
  explicitInsecureOverride?: boolean;
  capabilities?: Partial<ImapCapabilityMatrix>;
}

export interface ParsedRfc822Message {
  headers: Record<string, string>;
  bodyText?: string;
  bodyHtml?: string;
  hasAttachments: boolean;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  date?: string;
}

export interface ImapConnectionResult {
  imapConnected: true;
  tls: boolean;
  host: string;
  port: number;
}

export class ImapClientError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'ImapClientError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export class ImapClient {
  private readonly config: Required<ImapClientConfig>;

  constructor(config: ImapClientConfig) {
    this.config = resolveImapConfig(config);
  }

  async connect(): Promise<ImapConnectionResult> {
    enforceSecureTransport(this.config.tls, this.config.explicitInsecureOverride);
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.tls,
      auth: {
        user: this.config.username,
        ...(this.config.oauth2
          ? { accessToken: this.config.password }
          : { pass: this.config.password }),
      },
      logger: false,
      verifyOnly: true,
    });

    try {
      await client.connect();
      return {
        imapConnected: true,
        tls: this.config.tls,
        host: this.config.host,
        port: this.config.port,
      };
    } catch {
      throw new ImapClientError(
        'VALIDATION_ERROR',
        'imap connection or authentication failed'
      );
    } finally {
      client.close();
    }
  }

  parse(rawMessage: string): ParsedRfc822Message {
    return parseRfc822Message(rawMessage);
  }

  normalize(
    input: {
      provider: string;
      providerMessageId: string;
      mailbox: string;
      threadId?: string;
      rawMessage: string;
      receivedAt?: string;
    }
  ): NormalizedMailMessage {
    const parsed = parseRfc822Message(input.rawMessage);
    const normalized = {
      messageId: `${input.provider}_${input.providerMessageId}`,
      threadId: input.threadId,
      providerMessageId: input.providerMessageId,
      mailbox: input.mailbox,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc,
      bcc: parsed.bcc,
      subject: parsed.subject,
      snippet: parsed.bodyText ? parsed.bodyText.slice(0, 180) : undefined,
      bodyText: parsed.bodyText,
      bodyHtml: parsed.bodyHtml,
      receivedAt: resolveReceivedAt(parsed.date, input.receivedAt),
      hasAttachments: parsed.hasAttachments,
    };

    return validateNormalizedMailMessage(normalized);
  }
}

export function parseRfc822Message(rawMessage: string): ParsedRfc822Message {
  const normalizedLineEndings = rawMessage.replace(/\r\n/g, '\n');
  const [headerBlock, bodyBlock] = splitHeaderAndBody(normalizedLineEndings);

  const headers = parseHeaders(headerBlock);
  const contentType = headers['content-type'] ?? 'text/plain';
  const parsedBody = parseBodyByContentType(bodyBlock, contentType);

  const from = firstAddress(headers['from']) ?? 'unknown@unknown.local';
  const to = parseAddressList(headers['to']);
  const cc = parseAddressList(headers['cc']);
  const bcc = parseAddressList(headers['bcc']);

  return {
    headers,
    bodyText: parsedBody.bodyText,
    bodyHtml: parsedBody.bodyHtml,
    hasAttachments: parsedBody.hasAttachments,
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject: headers['subject'],
    date: headers['date'],
  };
}

function resolveImapConfig(config: ImapClientConfig): Required<ImapClientConfig> {
  const host = config.host?.trim();
  const username = config.username?.trim();
  const password = config.password?.trim();

  if (!host) {
    throw new ImapClientError('VALIDATION_ERROR', 'imap host is required');
  }
  if (!username) {
    throw new ImapClientError('VALIDATION_ERROR', 'imap username is required');
  }
  if (!password) {
    throw new ImapClientError('VALIDATION_ERROR', 'imap password is required');
  }

  return {
    host,
    port: config.port ?? 993,
    username,
    password,
    oauth2: config.oauth2 ?? false,
    tls: config.tls ?? true,
    explicitInsecureOverride: config.explicitInsecureOverride ?? false,
    capabilities: {
      read: config.capabilities?.read ?? true,
      search: config.capabilities?.search ?? true,
      move: config.capabilities?.move ?? true,
      idle: config.capabilities?.idle ?? true,
    },
  };
}

function enforceSecureTransport(tls: boolean, explicitInsecureOverride: boolean): void {
  if (!tls && !explicitInsecureOverride) {
    throw new ImapClientError('PROVIDER_POLICY_BLOCKED', 'insecure transport disabled');
  }
}

function parseHeaders(headerBlock: string): Record<string, string> {
  const unfolded = headerBlock.replace(/\n[ \t]+/g, ' ');
  const headers: Record<string, string> = {};

  for (const line of unfolded.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    headers[key] = value;
  }

  return headers;
}

function parseBodyByContentType(
  body: string,
  contentTypeHeader: string
): { bodyText?: string; bodyHtml?: string; hasAttachments: boolean } {
  const contentType = contentTypeHeader.toLowerCase();
  if (!contentType.includes('multipart/')) {
    if (contentType.includes('text/html')) {
      return {
        bodyHtml: body.trim() || undefined,
        hasAttachments: false,
      };
    }
    return {
      bodyText: body.trim() || undefined,
      hasAttachments: false,
    };
  }

  const boundary = extractBoundary(contentTypeHeader);
  if (!boundary) {
    return {
      bodyText: body.trim() || undefined,
      hasAttachments: false,
    };
  }

  const parts = splitMultipartSections(body, boundary);
  let bodyText: string | undefined;
  let bodyHtml: string | undefined;
  let hasAttachments = false;

  for (const part of parts) {
    const [partHeaderRaw, partBodyRaw] = splitHeaderAndBody(part);
    const partHeaders = parseHeaders(partHeaderRaw);
    const partContentType = (partHeaders['content-type'] ?? 'text/plain').toLowerCase();
    const disposition = (partHeaders['content-disposition'] ?? '').toLowerCase();

    if (partContentType.includes('multipart/')) {
      const nested = parseBodyByContentType(partBodyRaw, partHeaders['content-type'] ?? partContentType);
      bodyText = bodyText ?? nested.bodyText;
      bodyHtml = bodyHtml ?? nested.bodyHtml;
      hasAttachments = hasAttachments || nested.hasAttachments;
      continue;
    }

    if (
      disposition.includes('attachment') ||
      /filename\s*=/.test(partHeaders['content-disposition'] ?? '')
    ) {
      hasAttachments = true;
      continue;
    }

    if (partContentType.includes('text/plain') && !bodyText) {
      bodyText = partBodyRaw.trim() || undefined;
      continue;
    }

    if (partContentType.includes('text/html') && !bodyHtml) {
      bodyHtml = partBodyRaw.trim() || undefined;
    }
  }

  return {
    bodyText,
    bodyHtml,
    hasAttachments,
  };
}

function splitHeaderAndBody(value: string): [string, string] {
  const separator = '\n\n';
  const index = value.indexOf(separator);
  if (index < 0) {
    return [value, ''];
  }

  return [value.slice(0, index), value.slice(index + separator.length)];
}

function extractBoundary(contentType: string): string | undefined {
  const match = contentType.match(/boundary="?([^";]+)"?/i);
  return match?.[1];
}

function splitMultipartSections(body: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const sections: string[] = [];
  let collecting = false;
  let buffer: string[] = [];

  for (const line of lines) {
    if (line === delimiter) {
      if (collecting && buffer.length > 0) {
        sections.push(buffer.join('\n'));
      }
      collecting = true;
      buffer = [];
      continue;
    }

    if (line === endDelimiter) {
      if (collecting && buffer.length > 0) {
        sections.push(buffer.join('\n'));
      }
      break;
    }

    if (collecting) {
      buffer.push(line);
    }
  }

  return sections;
}

function parseAddressList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => firstAddress(item.trim()) ?? item.trim())
    .filter((item) => item.length > 0);
}

function firstAddress(value: string): string | undefined {
  const angleMatch = value.match(/<([^>]+)>/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim();
  }

  const plain = value.trim();
  return plain.length > 0 ? plain : undefined;
}

function resolveReceivedAt(headerDate: string | undefined, fallback: string | undefined): string {
  if (headerDate) {
    const parsed = Date.parse(headerDate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (fallback) {
    const parsed = Date.parse(fallback);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}
