import { randomUUID } from 'node:crypto';
import { SendfnDatabaseAdapter } from '../database/adapter';
import { SendfnError } from '../errors';
import type { EmailTransaction, CommunicationEvent } from '../types';
import { SuppressionManager } from '../suppression/manager';
import { AwsSnsVerifier, type AwsSnsVerifierOptions, type SnsMessage } from './aws-sns-verifier';

interface StructuredLogger {
  info?: (payload: Record<string, unknown>) => void;
  warn?: (payload: Record<string, unknown>) => void;
}

interface SesEvent {
  notificationType?: 'Bounce' | 'Complaint' | 'Delivery';
  mail?: {
    timestamp?: string;
    source?: string;
    messageId?: string;
    destination?: string[];
  };
  bounce?: {
    timestamp?: string;
    bounceType?: string;
    bounceSubType?: string;
    feedbackId?: string;
    bouncedRecipients?: Array<{ emailAddress?: string; diagnosticCode?: string; status?: string }>;
  };
  complaint?: {
    timestamp?: string;
    feedbackId?: string;
    complainedRecipients?: Array<{ emailAddress?: string }>;
    complaintFeedbackType?: string;
    complaintSubType?: string;
    userAgent?: string;
  };
  delivery?: {
    timestamp?: string;
    recipients?: string[];
    processingTimeMillis?: number;
    smtpResponse?: string;
    reportingMTA?: string;
  };
}

export interface WebhookProcessResult {
  accepted: true;
  verified: true;
  matchedTransactions: number;
  createdSuppressionEntries: number;
  orphanEvents: number;
}

export interface AwsSesWebhookHandlerOptions {
  verifier?: AwsSnsVerifier;
  logger?: StructuredLogger;
  now?: () => Date;
}

function createWebhookError(code: string, message: string): SendfnError {
  return new SendfnError(message, {
    code,
    retryable: false,
  });
}

function createRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function parseDate(value: string | undefined): Date {
  const parsed = value ? new Date(value) : new Date(NaN);
  if (Number.isNaN(parsed.getTime())) {
    throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
  }
  return parsed;
}

function createSyntheticReferenceId(providerMessageId: string): string {
  return `provider:aws-ses:${providerMessageId}`;
}

function isTerminalStatus(status: EmailTransaction['status']): boolean {
  return status === 'bounced' || status === 'complained' || status === 'failed';
}

function isLifecycleDuplicate(
  event: CommunicationEvent,
  providerMessageId: string,
  recipientEmail: string | null,
  eventType: CommunicationEvent['eventType']
): boolean {
  return (
    event.eventType === eventType &&
    event.provider === 'aws-ses' &&
    event.recipientEmail === recipientEmail &&
    event.metadata?.providerMessageId === providerMessageId
  );
}

export class AwsSesWebhookHandler {
  private readonly verifier: AwsSnsVerifier;
  private readonly logger: StructuredLogger;
  private readonly now: () => Date;

  constructor(
    private adapter: SendfnDatabaseAdapter,
    private suppressionManager: SuppressionManager,
    options: AwsSesWebhookHandlerOptions = {}
  ) {
    this.verifier = options.verifier ?? new AwsSnsVerifier();
    this.logger = options.logger ?? {};
    this.now = options.now ?? (() => new Date());
  }

  static createVerifier(options: AwsSnsVerifierOptions = {}): AwsSnsVerifier {
    return new AwsSnsVerifier(options);
  }

  async handleSnsNotification(
    snsMessage: SnsMessage,
    options: { requestId?: string } = {}
  ): Promise<WebhookProcessResult> {
    const requestId = options.requestId ?? createRequestId();
    const baseLog = {
      requestId,
      operation: 'webhook.process',
      provider: 'aws-ses',
      snsMessageId: snsMessage.MessageId ?? null,
    };

    try {
      await this.verifier.verify(snsMessage);
      const event = this.parseSesEvent(snsMessage.Message!);
      const result = await this.processEvent(event);

      this.logger.info?.({
        ...baseLog,
        status: 'accepted',
        verificationResult: 'verified',
        matchedTransactions: result.matchedTransactions,
        orphanEvents: result.orphanEvents,
        createdSuppressionEntries: result.createdSuppressionEntries,
      });

      return result;
    } catch (error) {
      const sendfnError =
        error instanceof SendfnError
          ? error
          : createWebhookError('SENDFN_INTERNAL_ERROR', 'Unexpected webhook failure');

      this.logger.warn?.({
        ...baseLog,
        status: 'rejected',
        verificationResult:
          sendfnError.code === 'SENDFN_WEBHOOK_SIGNATURE_INVALID' ? 'invalid-signature' : 'invalid-message',
        code: sendfnError.code,
        matchedTransactions: 0,
        orphanEvents: 0,
        createdSuppressionEntries: 0,
      });

      throw sendfnError;
    }
  }

  private parseSesEvent(rawMessage: string): SesEvent {
    let event: SesEvent;
    try {
      event = JSON.parse(rawMessage) as SesEvent;
    } catch {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    if (!event.notificationType || !event.mail?.messageId || !event.mail.timestamp) {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    return event;
  }

  private async processEvent(event: SesEvent): Promise<WebhookProcessResult> {
    switch (event.notificationType) {
      case 'Bounce':
        return this.handleBounce(event);
      case 'Complaint':
        return this.handleComplaint(event);
      case 'Delivery':
        return this.handleDelivery(event);
      default:
        throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }
  }

  private async handleBounce(event: SesEvent): Promise<WebhookProcessResult> {
    if (!event.bounce?.bouncedRecipients?.length) {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    const providerMessageId = event.mail!.messageId!;
    const transaction = await this.adapter.getEmailTransactionByProviderMessageId(providerMessageId);
    const referenceId = transaction?.id ?? createSyntheticReferenceId(providerMessageId);
    const existingEvents = await this.adapter.getEventsByReference(referenceId, 'email');
    const matchedTransactions = transaction ? 1 : 0;
    let createdSuppressionEntries = 0;
    const eventTimestamp = parseDate(event.bounce.timestamp ?? event.mail!.timestamp);

    for (const recipient of event.bounce.bouncedRecipients) {
      const recipientEmail = recipient.emailAddress ?? null;
      if (!recipientEmail) {
        continue;
      }

      if (!existingEvents.some((existingEvent) => isLifecycleDuplicate(existingEvent, providerMessageId, recipientEmail, 'bounced'))) {
        await this.adapter.recordEvent({
          referenceId,
          referenceType: 'email',
          eventType: 'bounced',
          provider: 'aws-ses',
          providerEventId: event.bounce.feedbackId ?? providerMessageId,
          recipientEmail,
          recipientPhone: null,
          deviceToken: null,
          metadata: {
            providerMessageId,
            orphaned: !transaction,
            bounceType: event.bounce.bounceType ?? null,
            bounceSubType: event.bounce.bounceSubType ?? null,
            diagnosticCode: recipient.diagnosticCode ?? null,
          },
          eventTimestamp,
        });
      }

      if ((event.bounce.bounceType ?? '').toLowerCase() === 'permanent') {
        const existingSuppression = await this.suppressionManager.checkSuppression(recipientEmail);
        await this.suppressionManager.addToSuppressionList({
          email: recipientEmail,
          reason: 'bounce',
          source: 'aws-ses',
          bounceType: event.bounce.bounceType ?? null,
          metadata: {
            providerMessageId,
            bounceSubType: event.bounce.bounceSubType ?? null,
            diagnosticCode: recipient.diagnosticCode ?? null,
          },
          suppressedAt: this.now(),
        });

        if (!existingSuppression.suppressed) {
          createdSuppressionEntries += 1;
        }
      }
    }

    if (transaction) {
      await this.applyLifecycleTransition(transaction, 'bounced', eventTimestamp);
    }

    return {
      accepted: true,
      verified: true,
      matchedTransactions,
      createdSuppressionEntries,
      orphanEvents: transaction ? 0 : 1,
    };
  }

  private async handleComplaint(event: SesEvent): Promise<WebhookProcessResult> {
    if (!event.complaint?.complainedRecipients?.length) {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    const providerMessageId = event.mail!.messageId!;
    const transaction = await this.adapter.getEmailTransactionByProviderMessageId(providerMessageId);
    const referenceId = transaction?.id ?? createSyntheticReferenceId(providerMessageId);
    const existingEvents = await this.adapter.getEventsByReference(referenceId, 'email');
    const matchedTransactions = transaction ? 1 : 0;
    let createdSuppressionEntries = 0;
    const eventTimestamp = parseDate(event.complaint.timestamp ?? event.mail!.timestamp);

    for (const recipient of event.complaint.complainedRecipients) {
      const recipientEmail = recipient.emailAddress ?? null;
      if (!recipientEmail) {
        continue;
      }

      if (!existingEvents.some((existingEvent) => isLifecycleDuplicate(existingEvent, providerMessageId, recipientEmail, 'complained'))) {
        await this.adapter.recordEvent({
          referenceId,
          referenceType: 'email',
          eventType: 'complained',
          provider: 'aws-ses',
          providerEventId: event.complaint.feedbackId ?? providerMessageId,
          recipientEmail,
          recipientPhone: null,
          deviceToken: null,
          metadata: {
            providerMessageId,
            orphaned: !transaction,
            complaintFeedbackType: event.complaint.complaintFeedbackType ?? null,
            complaintSubType: event.complaint.complaintSubType ?? null,
          },
          eventTimestamp,
        });
      }

      const existingSuppression = await this.suppressionManager.checkSuppression(recipientEmail);
      await this.suppressionManager.addToSuppressionList({
        email: recipientEmail,
        reason: 'complaint',
        source: 'aws-ses',
        bounceType: null,
        metadata: {
          providerMessageId,
          complaintFeedbackType: event.complaint.complaintFeedbackType ?? null,
          complaintSubType: event.complaint.complaintSubType ?? null,
          userAgent: event.complaint.userAgent ?? null,
        },
        suppressedAt: this.now(),
      });
      if (!existingSuppression.suppressed) {
        createdSuppressionEntries += 1;
      }
    }

    if (transaction) {
      await this.applyLifecycleTransition(transaction, 'complained', eventTimestamp);
    }

    return {
      accepted: true,
      verified: true,
      matchedTransactions,
      createdSuppressionEntries,
      orphanEvents: transaction ? 0 : 1,
    };
  }

  private async handleDelivery(event: SesEvent): Promise<WebhookProcessResult> {
    if (!event.delivery?.recipients?.length || !event.delivery.timestamp) {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    const providerMessageId = event.mail!.messageId!;
    const transaction = await this.adapter.getEmailTransactionByProviderMessageId(providerMessageId);
    const referenceId = transaction?.id ?? createSyntheticReferenceId(providerMessageId);
    const existingEvents = await this.adapter.getEventsByReference(referenceId, 'email');

    for (const recipientEmail of event.delivery.recipients) {
      if (!existingEvents.some((existingEvent) => isLifecycleDuplicate(existingEvent, providerMessageId, recipientEmail, 'delivered'))) {
        await this.adapter.recordEvent({
          referenceId,
          referenceType: 'email',
          eventType: 'delivered',
          provider: 'aws-ses',
          providerEventId: providerMessageId,
          recipientEmail,
          recipientPhone: null,
          deviceToken: null,
          metadata: {
            providerMessageId,
            orphaned: !transaction,
            processingTimeMillis: event.delivery.processingTimeMillis ?? null,
            smtpResponse: event.delivery.smtpResponse ?? null,
          },
          eventTimestamp: parseDate(event.delivery.timestamp),
        });
      }
    }

    if (transaction) {
      await this.applyLifecycleTransition(transaction, 'delivered', parseDate(event.delivery.timestamp));
    }

    return {
      accepted: true,
      verified: true,
      matchedTransactions: transaction ? 1 : 0,
      createdSuppressionEntries: 0,
      orphanEvents: transaction ? 0 : 1,
    };
  }

  private async applyLifecycleTransition(
    transaction: EmailTransaction,
    nextStatus: 'delivered' | 'bounced' | 'complained',
    timestamp: Date
  ): Promise<void> {
    if (nextStatus === 'delivered') {
      if (transaction.status === 'pending' || transaction.status === 'sent') {
        await this.adapter.updateEmailTransaction(transaction.id, {
          status: 'delivered',
          deliveredAt: transaction.deliveredAt ?? timestamp,
        });
      }
      return;
    }

    if (isTerminalStatus(transaction.status)) {
      return;
    }

    const timestampField =
      nextStatus === 'bounced'
        ? { bouncedAt: transaction.bouncedAt ?? timestamp }
        : { complainedAt: transaction.complainedAt ?? timestamp };

    await this.adapter.updateEmailTransaction(transaction.id, {
      status: nextStatus,
      ...timestampField,
    });
  }
}
