import { describe, expect, it, vi } from 'vitest';
import { gmailProvider, isHydratedGmailApiMessage } from '../src/gmail/index.js';

describe('isHydratedGmailApiMessage', () => {
  it('treats list summaries as needing hydration', () => {
    expect(isHydratedGmailApiMessage({ id: 'msg-1' })).toBe(false);
    expect(isHydratedGmailApiMessage({ id: 'msg-1', threadId: 'thread-1' })).toBe(false);
  });

  it('accepts hydrated Gmail API messages', () => {
    expect(
      isHydratedGmailApiMessage({
        id: 'msg-1',
        snippet: 'Hello world',
      })
    ).toBe(true);

    expect(
      isHydratedGmailApiMessage({
        id: 'msg-1',
        internalDate: '1710201600000',
      })
    ).toBe(true);

    expect(
      isHydratedGmailApiMessage({
        id: 'msg-1',
        payload: {
          headers: [{ name: 'Subject', value: 'Test' }],
        },
      })
    ).toBe(true);
  });

  it('exhausts incremental history pages before advancing the checkpoint', async () => {
    const get = vi.fn(async (_url: string, options?: { params?: Record<string, unknown> }) => {
      const pageToken = options?.params?.pageToken;
      if (pageToken === 'page-2') {
        return {
          data: {
            history: [{ messagesAdded: [{ message: { id: 'msg-2' } }] }],
            historyId: 'history-3',
          },
        };
      }
      if (_url.endsWith('/history')) {
        return {
          data: {
            history: [{ messagesAdded: [{ message: { id: 'msg-1' } }] }],
            historyId: 'history-2',
            nextPageToken: 'page-2',
          },
        };
      }

      const id = _url.endsWith('msg-2') ? 'msg-2' : 'msg-1';
      return {
        data: {
          id,
          threadId: `thread-${id}`,
          internalDate: `${Date.parse('2026-08-15T00:00:00.000Z')}`,
          payload: { headers: [] },
        },
      };
    });

    const result = await gmailProvider.actions['mail.sync'].execute(
      {
        tenantId: 'gmail-pagination-test',
        mode: 'incremental',
        checkpoint: 'history-1',
        pageSize: 1,
      },
      {
        userId: 'user-1',
        connectionId: 'gmail-pagination-connection',
        provider: { name: 'gmail', baseUrl: gmailProvider.baseUrl },
        http: { get },
      } as any
    );

    expect(result).toMatchObject({ checkpoint: 'history-3', fetched: 2 });
    expect(get).toHaveBeenCalledWith(
      expect.stringMatching(/\/history$/),
      expect.objectContaining({ params: expect.objectContaining({ pageToken: 'page-2' }) })
    );
  });
});
