import { describe, expect, it } from 'vitest';

import type { MailFnIdGenerator, Message, Thread } from './index.js';
import { resolveThread } from './threading.js';

describe('thread resolution', () => {
  it('orders thread activity by instant instead of ISO spelling', () => {
    const existing = {
      id: 'thr_1', projectId: 'prj_1', inboxId: 'inb_1', normalizedSubject: 'hello',
      messageIds: ['msg_1'], participants: [], labels: [],
      lastMessageAt: '2026-08-10T04:00:00+04:00',
      createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    } satisfies Thread;
    const message = {
      id: 'msg_2', projectId: 'prj_1', inboxId: 'inb_1', subject: 'Re: Hello',
      receivedAt: '2026-08-10T01:00:00.000Z', from: [], to: [], cc: [], references: [],
    } as unknown as Message;
    const ids = { generate: () => 'unused' } satisfies MailFnIdGenerator;

    expect(resolveThread(message, [existing], [], ids, '2026-08-10T01:00:01.000Z'))
      .toMatchObject({ id: 'thr_1', lastMessageAt: message.receivedAt });
  });
});
