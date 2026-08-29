import type { ExtractedVerification, Message } from './types.js';

const OTP_CONTEXT_TERMS = [
  'verification',
  'security',
  'login',
  'one-time',
  'one time',
  'authentication',
  'auth',
  'confirmation',
  'confirm',
];

const LINK_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const VERIFY_TERMS = /verify|verification|confirm|activate|magic|login|reset|recover/i;

export function extractOtp(message: Message): ExtractedVerification | null {
  for (const [field, value] of verificationFields(message)) {
    const plain = stripMarkup(value);
    const contextual = contextualOtp(plain);
    if (contextual) {
      return source(message, 'otp', contextual, field);
    }
    const generic = findDigitCode(plain, 6, 6);
    if (generic) {
      return source(message, 'otp', generic, field);
    }
  }
  return null;
}

function contextualOtp(value: string): string | null {
  const lower = value.toLowerCase();
  let contextStart = -1;
  for (const term of OTP_CONTEXT_TERMS) {
    const index = lower.indexOf(term);
    if (index !== -1 && (contextStart === -1 || index < contextStart)) contextStart = index;
  }
  return contextStart === -1
    ? null
    : findDigitCode(value.slice(contextStart, contextStart + 160), 4, 10);
}

function findDigitCode(value: string, minimumLength: number, maximumLength: number): string | null {
  let cursor = 0;
  while (cursor < value.length) {
    if (!isAsciiDigit(value.charCodeAt(cursor))) {
      cursor += 1;
      continue;
    }

    const start = cursor;
    while (cursor < value.length && isAsciiDigit(value.charCodeAt(cursor))) cursor += 1;
    const length = cursor - start;
    if (length >= minimumLength && length <= maximumLength) return value.slice(start, cursor);
  }
  return null;
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

export function extractVerificationLink(message: Message): ExtractedVerification | null {
  const candidates: Array<{ value: string; field: 'subject' | 'text' | 'html'; score: number }> = [];
  for (const [field, value] of verificationFields(message)) {
    const matches = value.match(LINK_PATTERN) ?? [];
    for (const raw of matches) {
      const normalized = raw.replace(/&amp;/g, '&').replace(/[).,;]+$/, '');
      let parsed: URL;
      try {
        parsed = new URL(normalized);
      } catch {
        continue;
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      const score =
        (VERIFY_TERMS.test(parsed.pathname) ? 4 : 0) +
        (VERIFY_TERMS.test(parsed.search) ? 3 : 0) +
        (parsed.searchParams.has('token') || parsed.searchParams.has('code') ? 2 : 0) +
        (field === 'html' ? 1 : 0);
      candidates.push({ value: parsed.toString(), field, score });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.value.localeCompare(right.value));
  const selected = candidates[0];
  return selected && selected.score > 0
    ? source(message, 'verification_link', selected.value, selected.field)
    : null;
}

function verificationFields(message: Message): Array<['subject' | 'text' | 'html', string]> {
  return [
    ['subject', message.subject],
    ['text', message.textBody ?? ''],
    ['html', message.htmlBody ?? ''],
  ];
}

function stripMarkup(value: string): string {
  const lower = value.toLowerCase();
  let cursor = 0;
  let plain = '';

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart === -1) return plain + value.slice(cursor);

    plain += value.slice(cursor, tagStart);
    const tagEnd = value.indexOf('>', tagStart + 1);
    if (tagEnd === -1) return `${plain} `;

    const tagName = openingTagName(lower, tagStart + 1, tagEnd);
    if (tagName === 'script' || tagName === 'style') {
      cursor = closingTagEnd(lower, tagName, tagEnd + 1);
    } else {
      cursor = tagEnd + 1;
    }
    plain += ' ';
  }

  return plain;
}

function openingTagName(value: string, start: number, end: number): string {
  let cursor = start;
  while (cursor < end && isHtmlWhitespace(value[cursor]!)) cursor += 1;
  if (value[cursor] === '/') return '';
  const nameStart = cursor;
  while (cursor < end && isTagNameCharacter(value[cursor]!)) cursor += 1;
  return value.slice(nameStart, cursor);
}

function closingTagEnd(value: string, tagName: 'script' | 'style', start: number): number {
  const token = `</${tagName}`;
  let candidate = value.indexOf(token, start);
  while (candidate !== -1) {
    const boundary = value[candidate + token.length];
    if (boundary === '>' || (boundary !== undefined && isHtmlWhitespace(boundary))) {
      const end = value.indexOf('>', candidate + token.length);
      return end === -1 ? value.length : end + 1;
    }
    candidate = value.indexOf(token, candidate + token.length);
  }
  return value.length;
}

function isHtmlWhitespace(value: string): boolean {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r' || value === '\f';
}

function isTagNameCharacter(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || value === '-' || value === ':';
}

function source(
  message: Message,
  type: ExtractedVerification['type'],
  value: string,
  matchedField: ExtractedVerification['matchedField'],
): ExtractedVerification {
  return {
    type,
    value,
    sourceMessageId: message.id,
    receivedAt: message.receivedAt,
    matchedField,
  };
}
