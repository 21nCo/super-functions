import {
  SendSmsParams,
  SmsTransaction,
  SendfnOptions
} from '../types';
import { SendfnDb } from '../database/sendfn-db';
import { SmsProvider } from './provider';

export class SmsService {
  constructor(
    private provider: SmsProvider,
    private db: SendfnDb,
    private options: SendfnOptions
  ) {}

  async sendSms(params: SendSmsParams): Promise<SmsTransaction> {
    // 1. Create Transaction (Pending)
    const transaction = await this.db.createSmsTransaction({
        userId: params.userId,
        to: params.to,
        message: params.message,
        provider: this.provider.name,
        providerMessageId: null,
        status: 'pending',
        sentAt: null,
        metadata: params.metadata || {}
    });

    let response: Awaited<ReturnType<SmsProvider['sendSms']>>;
    try {
        response = await this.provider.sendSms({
            to: params.to,
            message: params.message,
            metadata: params.metadata
        });
    } catch (error: any) {
         await this.db.updateSmsTransaction(transaction.id, {
            status: 'failed',
            metadata: { ...params.metadata, error: error.message }
        });

        if (this.options.eventTracking !== false) await this.db.recordEvent({
            referenceId: transaction.id,
            referenceType: 'sms',
            eventType: 'failed',
            provider: this.provider.name,
            providerEventId: null,
            recipientEmail: null,
            recipientPhone: params.to,
            deviceToken: null,
            metadata: { error: error.message },
            eventTimestamp: new Date()
        });

        throw error;
    }

    const acceptedData = {
        status: response.success ? 'sent' : 'failed',
        providerMessageId: response.providerMessageId ?? response.messageId ?? null,
        sentAt: response.success ? response.timestamp : null,
        metadata: {
            ...(params.metadata ?? {}),
            error: response.error
        }
    } as const;
    let accepted = { ...transaction, ...acceptedData } as SmsTransaction;
    const bookkeepingErrors: Array<{ stage: string; error: string }> = [];

    try {
      accepted = await this.db.updateSmsTransaction(transaction.id, acceptedData);
    } catch (error) {
      bookkeepingErrors.push({ stage: 'transaction:update-result', error: error instanceof Error ? error.message : String(error) });
    }

    if (this.options.eventTracking !== false) {
      try {
        await this.db.recordEvent({
          referenceId: transaction.id,
          referenceType: 'sms',
          eventType: response.success ? 'sent' : 'failed',
          provider: this.provider.name,
          providerEventId: response.providerMessageId ?? response.messageId ?? null,
          recipientEmail: null,
          recipientPhone: params.to,
          deviceToken: null,
          metadata: { error: response.error },
          eventTimestamp: response.timestamp,
        });
      } catch (error) {
        bookkeepingErrors.push({ stage: 'event:result', error: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const stored = await this.db.getSmsTransaction(transaction.id);
      if (stored) accepted = { ...stored, ...acceptedData } as SmsTransaction;
      else bookkeepingErrors.push({ stage: 'transaction:read-result', error: `Could not find SMS transaction ${transaction.id} after creation.` });
    } catch (error) {
      bookkeepingErrors.push({ stage: 'transaction:read-result', error: error instanceof Error ? error.message : String(error) });
    }

    if (bookkeepingErrors.length > 0) {
      accepted = { ...accepted, metadata: { ...(accepted.metadata ?? {}), bookkeepingErrors } };
      try {
        accepted = await this.db.updateSmsTransaction(transaction.id, { ...acceptedData, metadata: accepted.metadata });
      } catch {
        // The provider result remains authoritative when diagnostics cannot be persisted.
      }
    }
    return accepted;
  }
}
