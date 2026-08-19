import { describe, expect, it } from 'vitest';
import { ProviderPolicyError } from '@superfunctions/oauth-providers';
import {
  MemoryGmailCheckpointStore,
  MemoryGmailMessageStore,
  runGmailSync,
} from '../src/gmail/gmail.sync.js';

describe('gmail sync', () => {
  it('persists baseline checkpoint on full sync', async () => {
    const checkpointStore = new MemoryGmailCheckpointStore();
    const messageStore = new MemoryGmailMessageStore();

    const result = await runGmailSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'full',
      },
      {
        source: {
          listBaseline: async () => ({
            historyId: 'h-1',
            messages: [
              createGmailMessage('g-1', 'gt-1', 'h-1'),
              createGmailMessage('g-2', 'gt-2', 'h-1'),
            ],
          }),
          listIncremental: async () => ({
            historyId: 'h-2',
            messages: [],
          }),
        },
        checkpointStore,
        messageStore,
      }
    );

    expect(result.checkpoint).toBe('h-1');
    expect(result.fetched).toBe(2);
    expect(result.upserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.messages[0].providerMessageId).toBe('g-1');
    expect(result.messages[0].threadId).toBe('gt-1');

    const checkpoint = await checkpointStore.get('conn-1');
    expect(checkpoint).toMatchObject({
      historyId: 'h-1',
    });
  });

  it('exhausts baseline pagination while preserving the newest checkpoint', async () => {
    const checkpointStore = new MemoryGmailCheckpointStore();
    const pageTokens: Array<string | undefined> = [];
    const pagesWritten: string[][] = [];

    const result = await runGmailSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'full',
        pageSize: 1,
      },
      {
        source: {
          listBaseline: async ({ pageToken }) => {
            pageTokens.push(pageToken);
            return pageToken
              ? {
                  historyId: '100',
                  messages: [createGmailMessage('g-2', 'gt-2', '100')],
                }
              : {
                  historyId: '200',
                  messages: [createGmailMessage('g-1', 'gt-1', '200')],
                  nextPageToken: 'page-2',
                };
          },
          listIncremental: async () => ({ historyId: 'h-3', messages: [] }),
        },
        checkpointStore,
        messageStore: {
          upsert: async (_connectionId, messages) => {
            pagesWritten.push(messages.map((message) => message.providerMessageId));
            return { upserted: messages.length, skipped: 0 };
          },
        },
      }
    );

    expect(pageTokens).toEqual([undefined, 'page-2']);
    expect(result).toMatchObject({ checkpoint: '200', fetched: 2, partial: false });
    expect(result.messages).toHaveLength(1);
    expect(pagesWritten).toEqual([['g-1'], ['g-2']]);
    await expect(checkpointStore.get('conn-1')).resolves.toMatchObject({ historyId: '200' });
  });

  it('uses checkpoint for incremental sync and dedupes already-upserted messages', async () => {
    const checkpointStore = new MemoryGmailCheckpointStore();
    const messageStore = new MemoryGmailMessageStore();

    await runGmailSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'full',
      },
      {
        source: {
          listBaseline: async () => ({
            historyId: 'h-1',
            messages: [createGmailMessage('g-1', 'gt-1', 'h-1')],
          }),
          listIncremental: async () => ({
            historyId: 'h-2',
            messages: [],
          }),
        },
        checkpointStore,
        messageStore,
      }
    );

    const incremental = await runGmailSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'incremental',
      },
      {
        source: {
          listBaseline: async () => ({
            historyId: 'h-1',
            messages: [],
          }),
          listIncremental: async () => ({
            historyId: 'h-2',
            messages: [
              createGmailMessage('g-1', 'gt-1', 'h-2'),
              createGmailMessage('g-3', 'gt-3', 'h-2'),
            ],
          }),
        },
        checkpointStore,
        messageStore,
      }
    );

    expect(incremental.checkpoint).toBe('h-2');
    expect(incremental.fetched).toBe(2);
    expect(incremental.upserted).toBe(1);
    expect(incremental.skipped).toBe(1);
  });

  it('uses a durable runtime checkpoint when the local checkpoint store is empty', async () => {
    const checkpointStore = new MemoryGmailCheckpointStore();
    let receivedHistoryId: string | undefined;

    const result = await runGmailSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'incremental',
        checkpoint: 'h-durable',
      },
      {
        source: {
          listBaseline: async () => ({ historyId: 'h-1', messages: [] }),
          listIncremental: async ({ startHistoryId }) => {
            receivedHistoryId = startHistoryId;
            return { historyId: 'h-next', messages: [] };
          },
        },
        checkpointStore,
      }
    );

    expect(receivedHistoryId).toBe('h-durable');
    expect(result.checkpoint).toBe('h-next');
  });

  it('returns canonical MAIL_SYNC_CHECKPOINT_INVALID when incremental checkpoint is invalid', async () => {
    const checkpointStore = new MemoryGmailCheckpointStore();
    const messageStore = new MemoryGmailMessageStore();
    await checkpointStore.set('conn-1', {
      historyId: 'invalid-history-id',
      updatedAt: new Date().toISOString(),
    });

    await expect(
      runGmailSync(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          connectionId: 'conn-1',
          mode: 'incremental',
        },
        {
          source: {
            listBaseline: async () => ({
              historyId: 'h-1',
              messages: [],
            }),
            listIncremental: async () => {
              throw {
                status: 404,
                message: 'history id invalid',
              };
            },
          },
          checkpointStore,
          messageStore,
        }
      )
    ).rejects.toMatchObject({
      code: 'MAIL_SYNC_CHECKPOINT_INVALID',
      message: 'gmail checkpoint invalid; rebaseline required',
    });
  });

  it('blocks sync execution when policy registry disallows the operation', async () => {
    const checkpointStore = new MemoryGmailCheckpointStore();
    const messageStore = new MemoryGmailMessageStore();

    await expect(
      runGmailSync(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          connectionId: 'conn-1',
          mode: 'full',
        },
        {
          source: {
            listBaseline: async () => ({
              historyId: 'h-1',
              messages: [createGmailMessage('g-1', 'gt-1', 'h-1')],
            }),
            listIncremental: async () => ({
              historyId: 'h-2',
              messages: [],
            }),
          },
          checkpointStore,
          messageStore,
          policyRegistry: {
            assertOperationAllowed: () => {
              throw new ProviderPolicyError(
                'PROVIDER_POLICY_BLOCKED',
                'operation not allowed by policy'
              );
            },
          } as any,
        }
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'operation not allowed by policy',
    });
  });

  it.each([
    [undefined, false, false],
    ['metadata-only', false, false],
    ['snippet', true, false],
    ['full-body', true, true],
  ] as const)(
    'enforces %s feature mode on normalized message content',
    async (featureMode, expectSnippet, expectBody) => {
      const result = await runGmailSync(
        {
          tenantId: 'tenant-feature-mode',
          userId: 'user-feature-mode',
          connectionId: `conn-${featureMode ?? 'default'}`,
          mode: 'full',
          featureMode,
        },
        {
          source: {
            listBaseline: async () => ({
              historyId: 'history-feature-mode',
              messages: [createGmailMessage('g-feature', 'gt-feature', 'history-feature-mode')],
            }),
            listIncremental: async () => ({ historyId: 'unused', messages: [] }),
          },
          checkpointStore: new MemoryGmailCheckpointStore(),
          messageStore: new MemoryGmailMessageStore(),
        }
      );

      expect(result.messages[0].snippet !== undefined).toBe(expectSnippet);
      expect(result.messages[0].bodyText !== undefined).toBe(expectBody);
      expect(result.messages[0].bodyHtml).toBeUndefined();
    }
  );
});

function createGmailMessage(id: string, threadId: string, historyId: string) {
  return {
    id,
    threadId,
    historyId,
    internalDate: `${Date.parse('2026-03-12T00:00:00.000Z')}`,
    labelIds: ['INBOX'],
    snippet: 'Example snippet',
    payload: {
      headers: [
        { name: 'From', value: 'sender@example.com' },
        { name: 'To', value: 'user@example.com' },
        { name: 'Subject', value: 'Subject line' },
        { name: 'Date', value: 'Thu, 12 Mar 2026 00:00:00 GMT' },
      ],
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: {
            data: Buffer.from('Body text').toString('base64url'),
          },
        },
      ],
    },
  };
}
