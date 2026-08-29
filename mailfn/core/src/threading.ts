import type { MailFnIdGenerator } from './contracts.js';
import type { Message, Thread } from './types.js';

const PREFIX_PATTERN = /^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i;

export function normalizeThreadSubject(subject: string): string {
  return subject.replace(PREFIX_PATTERN, '').replace(/\s+/g, ' ').trim().toLowerCase() || '(no subject)';
}

export function resolveThread(
  message: Message,
  existing: Thread[],
  messages: Message[],
  ids: MailFnIdGenerator,
  now: string,
): Thread {
  const referenceIds = new Set(
    [message.inReplyTo, ...message.references].flatMap((value) => extractMessageIds(value)),
  );
  const parent = messages.find(
    (candidate) => candidate.internetMessageId && referenceIds.has(candidate.internetMessageId),
  );
  const normalizedSubject = normalizeThreadSubject(message.subject);
  const found =
    (parent?.threadId ? existing.find((thread) => thread.id === parent.threadId) : undefined) ??
    existing.find((thread) => thread.normalizedSubject === normalizedSubject);
  const participants = [
    ...message.from.map((entry) => entry.address),
    ...message.to.map((entry) => entry.address),
    ...message.cc.map((entry) => entry.address),
  ];

  if (found) {
    return {
      ...found,
      messageIds: Array.from(new Set([...found.messageIds, message.id])),
      participants: Array.from(new Set([...found.participants, ...participants])).sort(),
      lastMessageAt: message.receivedAt > found.lastMessageAt ? message.receivedAt : found.lastMessageAt,
      updatedAt: now,
    };
  }

  return {
    id: ids.generate('thr'),
    projectId: message.projectId,
    inboxId: message.inboxId,
    normalizedSubject,
    messageIds: [message.id],
    participants: Array.from(new Set(participants)).sort(),
    labels: [],
    lastMessageAt: message.receivedAt,
    createdAt: now,
    updatedAt: now,
  };
}

function extractMessageIds(value: string | undefined): string[] {
  if (!value) return [];
  const bracketed = value.match(/<[^<>\s]+>/g);
  if (bracketed?.length) return bracketed;
  return value.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
}
