import type { ExtractedVerification, Message } from './types.js';

const OTP_PATTERNS = [
  /(?:verification|security|login|one[- ]time|auth(?:entication)?|confirm(?:ation)?)\s*(?:code|pin|otp)?\s*(?:is|:|-)?\s*([0-9]{4,10})/i,
  /\b([0-9]{6})\b/,
];

const LINK_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const VERIFY_TERMS = /verify|verification|confirm|activate|magic|login|reset|recover/i;

export function extractOtp(message: Message): ExtractedVerification | null {
  for (const [field, value] of verificationFields(message)) {
    const plain = stripMarkup(value);
    for (const pattern of OTP_PATTERNS) {
      const match = pattern.exec(plain);
      if (match?.[1]) {
        return source(message, 'otp', match[1], field);
      }
    }
  }
  return null;
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
  return value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
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
