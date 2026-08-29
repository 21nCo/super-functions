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

    try {
        // 2. Send via Provider
        const response = await this.provider.sendSms({
            to: params.to,
            message: params.message,
            metadata: params.metadata
        });

        // 3. Update Transaction
        await this.db.updateSmsTransaction(transaction.id, {
            status: response.success ? 'sent' : 'failed',
            providerMessageId: response.providerMessageId,
            sentAt: response.timestamp,
            metadata: {
                ...params.metadata,
                error: response.error
            }
        });

        // 4. Record Event
        if (this.options.eventTracking !== false) await this.db.recordEvent({
            referenceId: transaction.id,
            referenceType: 'sms',
            eventType: response.success ? 'sent' : 'failed',
            provider: this.provider.name,
            providerEventId: response.providerMessageId || null,
            recipientEmail: null,
            recipientPhone: params.to,
            deviceToken: null,
            metadata: {
                error: response.error
            },
            eventTimestamp: response.timestamp
        });

        return await this.db.getSmsTransaction(transaction.id) as SmsTransaction;

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
  }
}
