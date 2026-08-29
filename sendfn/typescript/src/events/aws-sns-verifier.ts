import { createVerify } from 'node:crypto';
import { SendfnError } from '../errors';

export interface SnsMessage {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  Timestamp?: string;
  SignatureVersion?: string;
  Signature?: string;
  SigningCertURL?: string;
  UnsubscribeURL?: string;
}

export interface AwsSnsVerifierOptions {
  now?: () => Date;
  fetchCertificate?: (url: string) => Promise<string>;
  verifySignature?: (canonicalMessage: string, signature: string, certificate: string) => Promise<boolean> | boolean;
  maxAgeMs?: number;
}

const CERT_HOST_PATTERN = /^sns\.[a-z0-9-]+\.amazonaws\.com$/i;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function createWebhookError(code: string, message: string): SendfnError {
  return new SendfnError(message, {
    code,
    retryable: false,
  });
}

export class AwsSnsVerifier {
  private readonly now: () => Date;
  private readonly fetchCertificate: (url: string) => Promise<string>;
  private readonly verifySignature: (canonicalMessage: string, signature: string, certificate: string) => Promise<boolean> | boolean;
  private readonly maxAgeMs: number;

  constructor(options: AwsSnsVerifierOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.fetchCertificate = options.fetchCertificate ?? this.defaultFetchCertificate;
    this.verifySignature = options.verifySignature ?? this.defaultVerifySignature;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  async verify(message: SnsMessage): Promise<void> {
    this.validateEnvelopeShape(message);
    this.validateSigningCertUrl(message.SigningCertURL!);
    this.validateTimestamp(message.Timestamp!);

    const canonicalMessage = this.buildCanonicalMessage(message);
    const certificate = await this.fetchCertificate(message.SigningCertURL!);

    let isValid = false;
    try {
      isValid = await this.verifySignature(canonicalMessage, message.Signature!, certificate);
    } catch {
      throw createWebhookError('SENDFN_WEBHOOK_SIGNATURE_INVALID', 'SNS signature verification failed');
    }

    if (!isValid) {
      throw createWebhookError('SENDFN_WEBHOOK_SIGNATURE_INVALID', 'SNS signature verification failed');
    }
  }

  private validateEnvelopeShape(message: SnsMessage): void {
    const requiredFields: Array<keyof SnsMessage> = [
      'Type',
      'Message',
      'MessageId',
      'Timestamp',
      'SignatureVersion',
      'Signature',
      'SigningCertURL',
    ];

    for (const field of requiredFields) {
      if (typeof message[field] !== 'string' || message[field]!.trim() === '') {
        throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
      }
    }

    if (message.Type !== 'Notification') {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    if (message.SignatureVersion !== '1') {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }
  }

  private validateSigningCertUrl(value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw createWebhookError('SENDFN_WEBHOOK_SIGNATURE_INVALID', 'SNS signature verification failed');
    }

    if (url.protocol !== 'https:' || !CERT_HOST_PATTERN.test(url.hostname)) {
      throw createWebhookError('SENDFN_WEBHOOK_SIGNATURE_INVALID', 'SNS signature verification failed');
    }
  }

  private validateTimestamp(timestamp: string): void {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }

    if (Math.abs(this.now().getTime() - parsed.getTime()) > this.maxAgeMs) {
      throw createWebhookError('SENDFN_WEBHOOK_MESSAGE_INVALID', 'SNS message is malformed');
    }
  }

  private buildCanonicalMessage(message: SnsMessage): string {
    const orderedFields: Array<keyof SnsMessage> = [
      'Message',
      'MessageId',
      ...(message.Subject ? ['Subject' as const] : []),
      'Timestamp',
      'TopicArn',
      'Type',
    ];

    return orderedFields
      .map((field) => `${field}\n${message[field] ?? ''}`)
      .join('\n');
  }

  private async defaultFetchCertificate(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw createWebhookError('SENDFN_WEBHOOK_SIGNATURE_INVALID', 'SNS signature verification failed');
    }

    return response.text();
  }

  private defaultVerifySignature(canonicalMessage: string, signature: string, certificate: string): boolean {
    const verifier = createVerify('RSA-SHA1');
    verifier.update(canonicalMessage, 'utf8');
    verifier.end();
    return verifier.verify(certificate, Buffer.from(signature, 'base64'));
  }
}
