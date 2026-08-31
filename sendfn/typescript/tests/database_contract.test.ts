import { beforeEach, describe, expect, it } from 'vitest';
import { SendfnDb } from '../src/database/sendfn-db';
import { ValidationError } from '../src/errors';
import { EventTracker } from '../src/events/tracker';
import { SuppressionManager } from '../src/suppression/manager';
import { StrongMockAdapter, WeakOverwriteMockAdapter, assertTestDoubleFidelity } from './mock-adapter';

describe('Sendfn database contract', () => {
  let adapter: StrongMockAdapter;
  let db: SendfnDb;
  let eventTracker: EventTracker;
  let suppressionManager: SuppressionManager;

  beforeEach(() => {
    adapter = new StrongMockAdapter();
    db = new SendfnDb(adapter as any);
    eventTracker = new EventTracker(db);
    suppressionManager = new SuppressionManager(db, { enabled: true });
  });

  it('retrieves email transactions by provider message id and filters events by provider, user, and time window', async () => {
    await adapter.create({
      model: 'email_transactions',
      data: {
        id: 'tx-1',
        userId: 'user-123',
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Hello',
        templateId: null,
        templateData: null,
        provider: 'aws-ses',
        providerMessageId: 'ses-123',
        status: 'sent',
        sentAt: new Date('2026-04-01T00:00:00Z'),
        deliveredAt: null,
        bouncedAt: null,
        complainedAt: null,
        metadata: {},
        createdAt: new Date('2026-04-01T00:00:00Z'),
        updatedAt: new Date('2026-04-01T00:00:00Z'),
      },
    });

    await adapter.create({
      model: 'email_transactions',
      data: {
        id: 'tx-2',
        userId: 'user-999',
        to: 'other@example.com',
        from: 'noreply@example.com',
        subject: 'Hello',
        templateId: null,
        templateData: null,
        provider: 'aws-ses',
        providerMessageId: 'ses-999',
        status: 'sent',
        sentAt: new Date('2026-04-01T00:00:00Z'),
        deliveredAt: null,
        bouncedAt: null,
        complainedAt: null,
        metadata: {},
        createdAt: new Date('2026-04-01T00:00:00Z'),
        updatedAt: new Date('2026-04-01T00:00:00Z'),
      },
    });

    await adapter.create({
      model: 'communication_events',
      data: {
        id: 'evt-0',
        referenceId: 'tx-2',
        referenceType: 'email',
        eventType: 'delivered',
        provider: 'aws-ses',
        providerEventId: 'ses-999',
        recipientEmail: 'other@example.com',
        recipientPhone: null,
        deviceToken: null,
        metadata: {},
        eventTimestamp: new Date('2026-04-02T00:00:00Z'),
        createdAt: new Date('2026-04-02T00:00:00Z'),
      },
    });

    await adapter.create({
      model: 'communication_events',
      data: {
        id: 'evt-1',
        referenceId: 'tx-1',
        referenceType: 'email',
        eventType: 'delivered',
        provider: 'aws-ses',
        providerEventId: 'ses-123',
        recipientEmail: 'user@example.com',
        recipientPhone: null,
        deviceToken: null,
        metadata: {},
        eventTimestamp: new Date('2026-04-02T00:00:05Z'),
        createdAt: new Date('2026-04-02T00:00:05Z'),
      },
    });

    await adapter.create({
      model: 'communication_events',
      data: {
        id: 'evt-2',
        referenceId: 'tx-1',
        referenceType: 'email',
        eventType: 'delivered',
        provider: 'aws-ses',
        providerEventId: 'ses-123',
        recipientEmail: 'user@example.com',
        recipientPhone: null,
        deviceToken: null,
        metadata: {},
        eventTimestamp: new Date('2026-04-03T00:00:00Z'),
        createdAt: new Date('2026-04-03T00:00:00Z'),
      },
    });

    const transaction = await db.getEmailTransactionByProviderMessageId('ses-123');
    const events = await eventTracker.queryEvents({
      providerMessageId: 'ses-123',
      provider: 'aws-ses',
      userId: 'user-123',
      startAt: new Date('2026-04-01T00:00:00Z'),
      endAt: new Date('2026-04-03T00:00:00Z'),
      limit: 1,
    });

    expect(transaction?.id).toBe('tx-1');
    expect(events).toHaveLength(1);
    expect(events[0]?.referenceId).toBe('tx-1');
  });

  it('uses the required default and maximum query-event limits', async () => {
    await adapter.create({
      model: 'sms_transactions',
      data: {
        id: 'sms-1',
        userId: 'user-1',
        to: '+12065550100',
        message: 'hello',
        provider: 'console',
        providerMessageId: 'sms-provider-1',
        status: 'sent',
        sentAt: new Date('2026-04-01T00:00:00Z'),
        metadata: {},
        createdAt: new Date('2026-04-01T00:00:00Z'),
        updatedAt: new Date('2026-04-01T00:00:00Z'),
      },
    });

    for (let index = 0; index < 250; index += 1) {
      await adapter.create({
        model: 'communication_events',
        data: {
          id: `evt-${index}`,
          referenceId: 'sms-1',
          referenceType: 'sms',
          eventType: 'sent',
          provider: 'console',
          providerEventId: `provider-${index}`,
          recipientEmail: null,
          recipientPhone: '+12065550100',
          deviceToken: null,
          metadata: { index },
          eventTimestamp: new Date(`2026-04-01T00:${String(index % 60).padStart(2, '0')}:00Z`),
          createdAt: new Date(`2026-04-01T00:${String(index % 60).padStart(2, '0')}:00Z`),
        },
      });
    }

    const defaultLimited = await eventTracker.queryEvents({ provider: 'console' });
    const maxLimited = await eventTracker.queryEvents({ provider: 'console', limit: 500 });

    expect(defaultLimited).toHaveLength(50);
    expect(maxLimited).toHaveLength(200);
  });

  it('rejects invalid event windows with a stable validation error', async () => {
    await expect(
      eventTracker.queryEvents({
        startAt: new Date('2026-04-03T00:00:00Z'),
        endAt: new Date('2026-04-01T00:00:00Z'),
      })
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: '`startAt` must be earlier than `endAt`',
    });
  });

  it('normalizes suppression emails, exports deterministically, and removes using normalized keys', async () => {
    await suppressionManager.bulkAddToSuppressionList([
      {
        email: ' Beta@Example.com ',
        reason: 'manual',
        source: 'admin',
        bounceType: null,
        metadata: {},
        suppressedAt: new Date('2026-04-02T00:00:00Z'),
      },
      {
        email: ' alpha@example.com ',
        reason: 'unsubscribe',
        source: 'user',
        bounceType: null,
        metadata: {},
        suppressedAt: new Date('2026-04-02T00:00:00Z'),
      },
    ]);

    expect(await suppressionManager.checkSuppression('  ALPHA@example.com ')).toEqual(
      expect.objectContaining({
        suppressed: true,
        entry: expect.objectContaining({ email: 'alpha@example.com' }),
      })
    );

    const exported = await suppressionManager.exportSuppressionList();
    expect(exported.map((entry) => entry.email)).toEqual([
      'alpha@example.com',
      'beta@example.com',
    ]);
    expect(exported.map((entry) => entry.reason)).toEqual(['unsubscribe', 'manual']);

    const bounce = await suppressionManager.addToSuppressionList({
      email: 'bounce@example.com',
      reason: 'bounce',
      source: 'aws-ses',
      bounceType: 'Permanent',
      metadata: {},
      suppressedAt: new Date('2026-04-02T00:00:00Z'),
    });
    const complaint = await suppressionManager.addToSuppressionList({
      email: 'complaint@example.com',
      reason: 'complaint',
      source: 'aws-ses',
      bounceType: null,
      metadata: {},
      suppressedAt: new Date('2026-04-02T00:00:00Z'),
    });

    expect(bounce.reason).toBe('bounce');
    expect(complaint.reason).toBe('complaint');

    await suppressionManager.removeFromSuppressionList('  BETA@example.com ');
    expect(await suppressionManager.checkSuppression('beta@example.com')).toEqual({ suppressed: false });
  });

  it('raises on duplicate normalized emails in bulk suppression requests after the first persisted row', async () => {
    await expect(
      suppressionManager.bulkAddToSuppressionList([
        {
          email: 'USER@example.com',
          reason: 'manual',
          source: 'admin',
          bounceType: null,
          metadata: {},
          suppressedAt: new Date('2026-04-02T00:00:00Z'),
        },
        {
          email: 'user@example.com',
          reason: 'unsubscribe',
          source: 'user',
          bounceType: null,
          metadata: {},
          suppressedAt: new Date('2026-04-02T00:00:00Z'),
        },
      ])
    ).rejects.toBeInstanceOf(ValidationError);

    const exported = await suppressionManager.exportSuppressionList();
    expect(exported).toHaveLength(1);
    expect(exported[0]?.email).toBe('user@example.com');
  });

  it('fails the fidelity gate for weak test doubles and passes it for strong ones', async () => {
    await expect(assertTestDoubleFidelity(new StrongMockAdapter())).resolves.toBeUndefined();

    await expect(assertTestDoubleFidelity(new WeakOverwriteMockAdapter())).rejects.toMatchObject({
      code: 'SENDFN_TEST_DOUBLE_FIDELITY',
      message: 'Test double silently overwrites duplicate primary keys',
    });
  });
});
