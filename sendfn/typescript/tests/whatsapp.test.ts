import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sendfn,
  type SendfnConfig,
} from '../src';
import { createSendFn as createEdgeSendFn } from '../src/edge';
import { WhatsAppTransactionSchema } from '../src/types';
import { metaWhatsAppAdapter } from '../src/whatsapp/meta-cloud-adapter';
import { StrongMockAdapter } from './mock-adapter';

describe('WhatsApp channel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends through Meta Cloud API and records a transaction/event', async () => {
    const adapter = new StrongMockAdapter();
    const client = sendfn({
      database: adapter as any,
      whatsappProvider: metaWhatsAppAdapter({
        accessToken: 'test-token',
        phoneNumberId: 'phone-number-id',
      }),
    } satisfies SendfnConfig);

    const transaction = await client.whatsapp({
      userId: 'user-1',
      to: '+15551234567',
      message: 'Hello from sendfn',
      metadata: { traceId: 'trace-1' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v20.0/phone-number-id/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+15551234567',
      type: 'text',
      text: {
        preview_url: false,
        body: 'Hello from sendfn',
      },
    });
    expect(transaction).toMatchObject({
      userId: 'user-1',
      to: '+15551234567',
      message: 'Hello from sendfn',
      provider: 'meta-whatsapp',
      providerMessageId: 'wamid.123',
      status: 'sent',
    });

    const events = await client.getWhatsAppEvents(transaction.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      referenceType: 'whatsapp',
      eventType: 'sent',
      provider: 'meta-whatsapp',
      providerEventId: 'wamid.123',
      recipientPhone: '+15551234567',
    });
  });

  it('returns provider failure metadata for non-2xx Meta responses', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 131000,
            message: 'Something went wrong',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const adapter = metaWhatsAppAdapter({
      accessToken: 'test-token',
      phoneNumberId: 'phone-number-id',
    });

    const response = await adapter.sendWhatsApp({
      to: '+15551234567',
      message: 'Hello',
    });

    expect(response).toMatchObject({
      success: false,
      error: {
        code: '131000',
        message: 'Something went wrong',
        retryable: true,
      },
    });
  });

  it('rejects a successful Meta response without a message ID', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const adapter = metaWhatsAppAdapter({
      accessToken: 'test-token',
      phoneNumberId: 'phone-number-id',
    });

    const response = await adapter.sendWhatsApp({
      to: '+15551234567',
      message: 'Hello',
    });

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'META_WHATSAPP_INVALID_RESPONSE',
        message: 'Meta WhatsApp response did not include a message ID',
        retryable: false,
      },
      raw: { messages: [] },
    });
  });

  it('does not record success or failure events when tracking is disabled', async () => {
    const successAdapter = new StrongMockAdapter();
    const successClient = sendfn({
      database: successAdapter as any,
      whatsappProvider: metaWhatsAppAdapter({
        accessToken: 'test-token',
        phoneNumberId: 'phone-number-id',
      }),
      options: { eventTracking: false },
    } satisfies SendfnConfig);

    await successClient.whatsapp({
      userId: 'user-1',
      to: '+15551234567',
      message: 'Hello without events',
    });

    expect(successAdapter.records('communication_events')).toHaveLength(0);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 131000, message: 'Failed' } }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const failureAdapter = new StrongMockAdapter();
    const failureClient = sendfn({
      database: failureAdapter as any,
      whatsappProvider: metaWhatsAppAdapter({
        accessToken: 'test-token',
        phoneNumberId: 'phone-number-id',
      }),
      options: { eventTracking: false },
    } satisfies SendfnConfig);

    const failedTransaction = await failureClient.whatsapp({
      userId: 'user-1',
      to: '+15551234567',
      message: 'Hello without failure events',
    });

    expect(failedTransaction.status).toBe('failed');
    expect(failureAdapter.records('communication_events')).toHaveLength(0);
  });

  it('throws when the updated transaction cannot be loaded', async () => {
    class MissingWhatsAppReadAdapter extends StrongMockAdapter {
      override async findOne<T = any>(params: any): Promise<T | null> {
        if (params.model === 'whatsapp_transactions') {
          return null;
        }
        return super.findOne<T>(params);
      }
    }

    const client = sendfn({
      database: new MissingWhatsAppReadAdapter() as any,
      whatsappProvider: metaWhatsAppAdapter({
        accessToken: 'test-token',
        phoneNumberId: 'phone-number-id',
      }),
    } satisfies SendfnConfig);

    await expect(
      client.whatsapp({
        userId: 'user-1',
        to: '+15551234567',
        message: 'Hello missing transaction',
      })
    ).rejects.toThrow(/Could not find WhatsApp transaction .* after creation/);
  });

  it('supports the edge client without a database adapter', async () => {
    const client = createEdgeSendFn({
      whatsappProvider: metaWhatsAppAdapter({
        accessToken: 'test-token',
        phoneNumberId: 'phone-number-id',
      }),
    });

    const transaction = await client.whatsapp({
      userId: 'user-1',
      to: '+15551234567',
      message: 'Hello edge',
    });

    expect(transaction).toMatchObject({
      userId: 'user-1',
      to: '+15551234567',
      message: 'Hello edge',
      provider: 'meta-whatsapp',
      providerMessageId: 'wamid.123',
      status: 'sent',
    });
    expect(() => WhatsAppTransactionSchema.parse(transaction)).not.toThrow();
    expect(transaction.id).not.toBe('wamid.123');
  });
});
