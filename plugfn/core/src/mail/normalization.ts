import { z } from 'zod';

export const NormalizedMailMessageSchema = z.object({
  messageId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  providerMessageId: z.string().min(1),
  mailbox: z.string().min(1),
  from: z.string().min(1),
  to: z.array(z.string().min(1)),
  cc: z.array(z.string().min(1)).optional(),
  bcc: z.array(z.string().min(1)).optional(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  receivedAt: z.string().datetime({ offset: true }),
  labels: z.array(z.string().min(1)).optional(),
  hasAttachments: z.boolean(),
});

export type NormalizedMailMessage = z.infer<typeof NormalizedMailMessageSchema>;

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: GmailMessageBody;
  parts?: GmailMessagePart[];
}

export interface GmailApiMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export interface OutlookGraphEmailAddress {
  address?: string;
  name?: string;
}

export interface OutlookGraphRecipient {
  emailAddress?: OutlookGraphEmailAddress;
}

export interface OutlookGraphMessage {
  id: string;
  conversationId?: string;
  from?: OutlookGraphRecipient;
  toRecipients?: OutlookGraphRecipient[];
  ccRecipients?: OutlookGraphRecipient[];
  bccRecipients?: OutlookGraphRecipient[];
  subject?: string;
  bodyPreview?: string;
  body?: {
    contentType?: 'text' | 'html';
    content?: string;
  };
  receivedDateTime?: string;
  internetMessageHeaders?: GmailMessageHeader[];
  categories?: string[];
  hasAttachments?: boolean;
}

export class MailNormalizationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly status = 400;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'MailNormalizationError';
    this.field = field;
  }
}

export function normalizeGmailMessage(
  message: GmailApiMessage,
  options: {
    mailbox?: string;
  } = {}
): NormalizedMailMessage {
  const headers = message.payload?.headers ?? [];
  const from = readHeader(headers, 'from');
  const to = parseAddressList(readHeader(headers, 'to'));
  const cc = parseAddressList(readHeader(headers, 'cc'));
  const bcc = parseAddressList(readHeader(headers, 'bcc'));
  const subject = readHeader(headers, 'subject');
  const receivedAt = resolveReceivedAt(message, headers);
  const bodyText = decodePartBody(findPartByMimeType(message.payload, 'text/plain'));
  const bodyHtml = decodePartBody(findPartByMimeType(message.payload, 'text/html'));
  const hasAttachments = hasAttachmentParts(message.payload);

  const normalized: NormalizedMailMessage = {
    messageId: `gmail_${message.id}`,
    threadId: message.threadId,
    providerMessageId: message.id,
    mailbox: options.mailbox ?? 'inbox',
    from: from ?? 'unknown@unknown.local',
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject: subject ?? undefined,
    snippet: message.snippet ?? undefined,
    bodyText: bodyText ?? undefined,
    bodyHtml: bodyHtml ?? undefined,
    receivedAt,
    labels: message.labelIds && message.labelIds.length > 0 ? [...message.labelIds] : undefined,
    hasAttachments,
  };

  return validateNormalizedMailMessage(normalized);
}

export function normalizeGmailMessages(
  messages: GmailApiMessage[],
  options: {
    mailbox?: string;
  } = {}
): NormalizedMailMessage[] {
  return messages.map((message) => normalizeGmailMessage(message, options));
}

export function normalizeOutlookMessage(
  message: OutlookGraphMessage,
  options: {
    mailbox?: string;
  } = {}
): NormalizedMailMessage {
  const fromFromHeader = readHeader(message.internetMessageHeaders ?? [], 'from');
  const from =
    message.from?.emailAddress?.address ??
    fromFromHeader ??
    'unknown@unknown.local';
  const to = collectOutlookRecipients(message.toRecipients);
  const cc = collectOutlookRecipients(message.ccRecipients);
  const bcc = collectOutlookRecipients(message.bccRecipients);
  const subject = message.subject?.trim() || undefined;
  const bodyText =
    message.body?.contentType === 'text'
      ? message.body.content
      : message.bodyPreview || undefined;
  const bodyHtml = message.body?.contentType === 'html' ? message.body.content : undefined;
  const receivedAt = resolveOutlookReceivedAt(message);

  const normalized: NormalizedMailMessage = {
    messageId: `outlook_${message.id}`,
    threadId: message.conversationId,
    providerMessageId: message.id,
    mailbox: options.mailbox ?? 'inbox',
    from,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject,
    snippet: message.bodyPreview || undefined,
    bodyText: bodyText || undefined,
    bodyHtml: bodyHtml || undefined,
    receivedAt,
    labels: message.categories && message.categories.length > 0 ? [...message.categories] : undefined,
    hasAttachments: message.hasAttachments === true,
  };

  return validateNormalizedMailMessage(normalized);
}

export function normalizeOutlookMessages(
  messages: OutlookGraphMessage[],
  options: {
    mailbox?: string;
  } = {}
): NormalizedMailMessage[] {
  return messages.map((message) => normalizeOutlookMessage(message, options));
}

export function validateNormalizedMailMessage(input: unknown): NormalizedMailMessage {
  const result = NormalizedMailMessageSchema.safeParse(input);
  if (!result.success) {
    const field = result.error.issues[0]?.path?.join('.') || undefined;
    throw new MailNormalizationError('invalid normalized mail message', field);
  }
  return result.data;
}

function readHeader(headers: GmailMessageHeader[], name: string): string | undefined {
  const target = name.toLowerCase();
  for (const header of headers) {
    if (header.name.toLowerCase() === target) {
      const value = header.value.trim();
      if (value.length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

function parseAddressList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function collectOutlookRecipients(recipients: OutlookGraphRecipient[] | undefined): string[] {
  if (!recipients) {
    return [];
  }

  const values: string[] = [];
  for (const recipient of recipients) {
    const address = recipient.emailAddress?.address?.trim();
    if (address) {
      values.push(address);
    }
  }

  return values;
}

function resolveReceivedAt(message: GmailApiMessage, headers: GmailMessageHeader[]): string {
  const headerDate = readHeader(headers, 'date');
  if (headerDate) {
    const parsed = Date.parse(headerDate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  if (message.internalDate) {
    const asNumber = Number(message.internalDate);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return new Date(asNumber).toISOString();
    }

    const parsed = Date.parse(message.internalDate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function resolveOutlookReceivedAt(message: OutlookGraphMessage): string {
  if (message.receivedDateTime) {
    const parsed = Date.parse(message.receivedDateTime);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function findPartByMimeType(part: GmailMessagePart | undefined, mimeType: string): GmailMessagePart | undefined {
  if (!part) {
    return undefined;
  }

  if (part.mimeType === mimeType) {
    return part;
  }

  if (!part.parts || part.parts.length === 0) {
    return undefined;
  }

  for (const child of part.parts) {
    const found = findPartByMimeType(child, mimeType);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function decodePartBody(part: GmailMessagePart | undefined): string | undefined {
  const body = part?.body?.data;
  if (!body) {
    return undefined;
  }

  const normalized = body.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function hasAttachmentParts(part: GmailMessagePart | undefined): boolean {
  if (!part) {
    return false;
  }

  if ((part.filename && part.filename.trim().length > 0) || part.body?.attachmentId) {
    return true;
  }

  if (!part.parts || part.parts.length === 0) {
    return false;
  }

  return part.parts.some((child) => hasAttachmentParts(child));
}
