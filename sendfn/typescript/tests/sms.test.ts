import { describe, expect, it, vi } from 'vitest';

import { SendfnDb } from '../src/database/sendfn-db';
import { SmsService } from '../src/sms/service';
import { StrongMockAdapter } from './mock-adapter';

describe('SmsService', () => {
  it('does not rewrite an accepted SMS as failed when event persistence fails', async () => {
    const rawAdapter = new StrongMockAdapter();
    const db = new SendfnDb(rawAdapter as any);
    vi.spyOn(db, 'recordEvent').mockRejectedValueOnce(new Error('event store unavailable'));
    const service = new SmsService({
      name: 'test-sms',
      async initialize() {},
      async sendSms() {
        return {
          success: true,
          providerMessageId: 'sms-1',
          timestamp: new Date('2026-04-05T00:00:00Z'),
        };
      },
      async isHealthy() { return true; },
      async close() {},
    }, db, {});

    await expect(service.sendSms({
      userId: 'user-1',
      to: '+15555550100',
      message: 'Hello',
    })).rejects.toThrow('event store unavailable');
    expect(rawAdapter.records('sms_transactions')).toEqual([
      expect.objectContaining({ status: 'sent', providerMessageId: 'sms-1' }),
    ]);
  });
});
