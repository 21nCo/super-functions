import type { MailAddress, MailFnMimeParser, ParsedMessage } from '@mailfn/core';
import PostalMime from 'postal-mime';

interface PostalAddress {
  address?: string;
  name?: string;
  group?: PostalAddress[];
}

interface PostalResult {
  messageId?: string;
  subject?: string;
  text?: string;
  html?: string;
  from?: PostalAddress;
  to?: PostalAddress[];
  cc?: PostalAddress[];
  bcc?: PostalAddress[];
  replyTo?: PostalAddress[];
  inReplyTo?: string;
  references?: string | string[];
  headers?: Array<{ key: string; value: string }>;
  attachments?: Array<{
    filename?: string;
    mimeType?: string;
    content?: Uint8Array | ArrayBuffer | string;
    contentId?: string;
    disposition?: string;
  }>;
}

export class PostalMimeParser implements MailFnMimeParser {
  public async parse(raw: Uint8Array): Promise<ParsedMessage> {
    const parsed = (await PostalMime.parse(Uint8Array.from(raw))) as PostalResult;
    const headers: Record<string, string[]> = {};
    for (const header of parsed.headers ?? []) {
      const key = header.key.toLowerCase();
      (headers[key] ??= []).push(header.value);
    }
    const authenticationRaw = headers['authentication-results']?.join('; ');
    return {
      internetMessageId: parsed.messageId ?? first(headers, 'message-id'),
      from: flatten(parsed.from ? [parsed.from] : []),
      to: flatten(parsed.to ?? []),
      cc: flatten(parsed.cc ?? []),
      bcc: flatten(parsed.bcc ?? []),
      replyTo: flatten(parsed.replyTo ?? []),
      subject: parsed.subject,
      text: parsed.text,
      html: parsed.html,
      headers,
      inReplyTo: parsed.inReplyTo ?? first(headers, 'in-reply-to'),
      references: normalizeReferences(parsed.references ?? first(headers, 'references')),
      authenticationResults: authenticationRaw
        ? {
            raw: authenticationRaw,
            spf: result(authenticationRaw, 'spf'),
            dkim: result(authenticationRaw, 'dkim'),
            dmarc: result(authenticationRaw, 'dmarc'),
            arc: result(authenticationRaw, 'arc'),
          }
        : undefined,
      attachments: (parsed.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.mimeType,
        content: bytes(attachment.content),
        contentId: attachment.contentId?.replace(/^<|>$/g, ''),
        disposition: attachment.disposition,
      })),
    };
  }
}

function flatten(entries: PostalAddress[]): MailAddress[] {
  return entries.flatMap((entry) =>
    entry.group?.length
      ? flatten(entry.group)
      : entry.address
        ? [{ address: entry.address, name: entry.name }]
        : [],
  );
}

function first(headers: Record<string, string[]>, key: string): string | undefined {
  return headers[key]?.[0];
}

function normalizeReferences(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const joined = Array.isArray(value) ? value.join(' ') : value;
  return Array.from(joined.matchAll(/<[^>]+>/g), (match) => match[0]);
}

function result(value: string, mechanism: string): string | undefined {
  return new RegExp(`(?:^|[;\\s])${mechanism}=([a-z_-]+)`, 'i').exec(value)?.[1]?.toLowerCase();
}

function bytes(value: Uint8Array | ArrayBuffer | string | undefined): Uint8Array {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return new Uint8Array();
}
