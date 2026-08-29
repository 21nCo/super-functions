import {
  SendfnOptions,
  SendWhatsAppParams,
  WhatsAppTransaction,
} from '../types';
import { SendfnDb } from '../database/sendfn-db';
import { WhatsAppProvider } from './provider';

export class WhatsAppService {
  constructor(
    private provider: WhatsAppProvider,
    private db: SendfnDb,
    private options: SendfnOptions
  ) {}

  async sendWhatsApp(params: SendWhatsAppParams): Promise<WhatsAppTransaction> {
    const transaction = await this.db.createWhatsAppTransaction({
      userId: params.userId,
      to: params.to,
      message: params.message,
      provider: this.provider.name,
      providerMessageId: null,
      status: 'pending',
      sentAt: null,
      metadata: params.metadata ?? {},
    });

    try {
      const response = await this.provider.sendWhatsApp({
        to: params.to,
        message: params.message,
        previewUrl: params.previewUrl,
        metadata: params.metadata,
      });

      await this.db.updateWhatsAppTransaction(transaction.id, {
        status: response.success ? 'sent' : 'failed',
        providerMessageId: response.providerMessageId ?? response.messageId ?? null,
        sentAt: response.success ? response.timestamp : null,
        metadata: {
          ...(params.metadata ?? {}),
          raw: response.raw,
          error: response.error,
        },
      });

      if (this.options.eventTracking !== false) {
        await this.db.recordEvent({
          referenceId: transaction.id,
          referenceType: 'whatsapp',
          eventType: response.success ? 'sent' : 'failed',
          provider: this.provider.name,
          providerEventId: response.providerMessageId ?? response.messageId ?? null,
          recipientEmail: null,
          recipientPhone: params.to,
          deviceToken: null,
          metadata: {
            error: response.error,
            raw: response.raw,
          },
          eventTimestamp: response.timestamp,
        });
      }

      const updatedTransaction = await this.db.getWhatsAppTransaction(transaction.id);
      if (!updatedTransaction) {
        throw new Error(
          `Could not find WhatsApp transaction ${transaction.id} after creation.`
        );
      }
      return updatedTransaction;
    } catch (error: any) {
      await this.db.updateWhatsAppTransaction(transaction.id, {
        status: 'failed',
        metadata: { ...(params.metadata ?? {}), error: error.message },
      });

      if (this.options.eventTracking !== false) {
        await this.db.recordEvent({
          referenceId: transaction.id,
          referenceType: 'whatsapp',
          eventType: 'failed',
          provider: this.provider.name,
          providerEventId: null,
          recipientEmail: null,
          recipientPhone: params.to,
          deviceToken: null,
          metadata: { error: error.message },
          eventTimestamp: new Date(),
        });
      }

      throw error;
    }
  }
}
