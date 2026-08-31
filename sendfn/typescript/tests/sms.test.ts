import { describe, expect, it, vi } from 'vitest';

import { SendfnDb } from '../src/database/sendfn-db';
import { SmsService } from '../src/sms/service';
import { StrongMockAdapter } from './mock-adapter';

describe('SmsService', () => {
  it('returns an accepted SMS with diagnostics when result bookkeeping fails', async () => {
    const rawAdapter = new StrongMockAdapter();
    const db = new SendfnDb(rawAdapter as any);
    vi.spyOn(db, 'updateSmsTransaction').mockRejectedValue(new Error('transaction store unavailable'));
    vi.spyOn(db, 'recordEvent').mockRejectedValue(new Error('event store unavailable'));
    vi.spyOn(db, 'getSmsTransaction').mockRejectedValue(new Error('transaction read unavailable'));
    let sendCalls = 0;
    const service = new SmsService({
      name: 'test-sms',
      async initialize() {},
      async sendSms() {
        sendCalls += 1;
        return {
          success: true,
          providerMessageId: 'sms-1',
          timestamp: new Date('2026-04-05T00:00:00Z'),
        };
      },
      async isHealthy() { return true; },
      async close() {},
    }, db, {});

    const result = await service.sendSms({
      userId: 'user-1',
      to: '+15555550100',
      message: 'Hello',
    });

    expect(result).toMatchObject({
      status: 'sent',
      providerMessageId: 'sms-1',
      metadata: {
        bookkeepingErrors: [
          { stage: 'transaction:update-result', error: 'transaction store unavailable' },
          { stage: 'event:result', error: 'event store unavailable' },
          { stage: 'transaction:read-result', error: 'transaction read unavailable' },
        ],
      },
    });
    expect(sendCalls).toBe(1);
    expect(rawAdapter.records('sms_transactions')).toEqual([
      expect.objectContaining({ status: 'pending' }),
    ]);
  });
});
