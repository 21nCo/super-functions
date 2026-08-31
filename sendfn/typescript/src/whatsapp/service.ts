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

    let response;
    try {
      response = await this.provider.sendWhatsApp({
        to: params.to,
        message: params.message,
        previewUrl: params.previewUrl,
        metadata: params.metadata,
      });
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

    const acceptedData = {
      status: response.success ? 'sent' : 'failed',
      providerMessageId: response.providerMessageId ?? response.messageId ?? null,
      sentAt: response.success ? response.timestamp : null,
      metadata: {
        ...(params.metadata ?? {}),
        raw: response.raw,
        error: response.error,
      },
    } as const;
    let accepted = { ...transaction, ...acceptedData } as WhatsAppTransaction;
    const bookkeepingErrors: Array<{ stage: string; error: string }> = [];

    try {
      accepted = await this.db.updateWhatsAppTransaction(transaction.id, acceptedData);
    } catch (error) {
      bookkeepingErrors.push({ stage: 'transaction:update-result', error: error instanceof Error ? error.message : String(error) });
    }

    if (this.options.eventTracking !== false) {
      try {
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
      } catch (error) {
        bookkeepingErrors.push({ stage: 'event:result', error: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const stored = await this.db.getWhatsAppTransaction(transaction.id);
      if (stored) accepted = { ...stored, ...acceptedData } as WhatsAppTransaction;
      else bookkeepingErrors.push({ stage: 'transaction:read-result', error: `Could not find WhatsApp transaction ${transaction.id} after creation.` });
    } catch (error) {
      bookkeepingErrors.push({ stage: 'transaction:read-result', error: error instanceof Error ? error.message : String(error) });
    }

    if (bookkeepingErrors.length > 0) {
      accepted = {
        ...accepted,
        metadata: { ...(accepted.metadata ?? {}), bookkeepingErrors },
      };
      try {
        accepted = await this.db.updateWhatsAppTransaction(transaction.id, {
          ...acceptedData,
          metadata: accepted.metadata,
        });
      } catch {
        // The accepted provider result remains authoritative even if diagnostics cannot be persisted.
      }
    }
    return accepted;
  }
}
