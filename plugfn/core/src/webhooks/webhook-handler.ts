import type { WebhookEvent, TriggerHandler } from '../types/trigger.js';
import type { Logger } from '../types/action.js';
import { ProviderRegistry } from '../core/provider-registry.js';
import type { WebhookVerificationContext } from '../types/trigger.js';

export class WebhookHandlerError extends Error {
  readonly code:
    | 'WEBHOOK_SECRET_NOT_FOUND'
    | 'WEBHOOK_SIGNATURE_INVALID'
    | 'WEBHOOK_SIGNATURE_REQUIRED'
    | 'WEBHOOK_HANDLER_FAILED'
    | 'VALIDATION_ERROR';
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(
    code:
      | 'WEBHOOK_SECRET_NOT_FOUND'
      | 'WEBHOOK_SIGNATURE_INVALID'
      | 'WEBHOOK_SIGNATURE_REQUIRED'
      | 'WEBHOOK_HANDLER_FAILED'
      | 'VALIDATION_ERROR',
    message: string,
    status = 400,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'WebhookHandlerError';
    this.code = code;
    this.status = status;
    this.retryable = status >= 500;
    this.details = details;
  }
}

export class WebhookHandler {
  private handlers = new Map<string, Set<TriggerHandler>>();
  private processedEventIds = new Map<string, number>();
  private readonly maxProcessedEventIds = 10000;

  constructor(
    private providerRegistry: ProviderRegistry,
    private logger: Logger,
    private options: { verifySignatures?: boolean } = {}
  ) {}

  async handleWebhook(
    provider: string,
    event: string,
    payload: any,
    headers: Record<string, string>,
    secret?: string,
    options: {
      rawBody?: Uint8Array;
    } = {}
  ): Promise<WebhookEvent> {
    const prepared = await this.verifyWebhook(provider, event, payload, headers, secret, options);
    const { triggerKey, trigger, transformedPayload, normalizedHeaders, signature, verified } = prepared;

    const webhookEvent: WebhookEvent = {
      id: this.generateEventId(),
      provider,
      event: triggerKey,
      payload: transformedPayload,
      signature,
      receivedAt: new Date(),
      verified,
      headers: normalizedHeaders,
    };

    if (trigger.webhookConfig?.shouldDispatch?.(transformedPayload) === false) {
      this.logger.info(`Webhook dispatch skipped: ${provider}.${triggerKey}`);
      return webhookEvent;
    }

    const eventId = getEventId(transformedPayload, normalizedHeaders);
    const idempotencyKey = eventId ? `${provider}:${eventId}` : null;
    if (idempotencyKey && this.processedEventIds.has(idempotencyKey)) {
      this.logger.info(`Webhook duplicate ignored: ${provider}.${triggerKey}`, { eventId });
      return webhookEvent;
    }

    const triggerEvent = await trigger.handler(transformedPayload);
    await this.emit(provider, triggerKey, { ...triggerEvent, ...webhookEvent });

    if (idempotencyKey) {
      this.rememberProcessedEvent(idempotencyKey);
    }

    this.logger.info(`Webhook handled: ${provider}.${triggerKey}`, { verified, eventId });
    return webhookEvent;
  }

  async verifyWebhook(
    provider: string,
    event: string,
    payload: any,
    headers: Record<string, string>,
    secret?: string,
    options: {
      rawBody?: Uint8Array;
    } = {}
  ): Promise<{
    triggerKey: string;
    trigger: any;
    transformedPayload: any;
    normalizedHeaders: Record<string, string>;
    signature: string;
    verified: boolean;
  }> {
    const providerObj = this.providerRegistry.get(provider);
    if (!providerObj) {
      throw new WebhookHandlerError('VALIDATION_ERROR', `Provider ${provider} not found`, 404);
    }

    const { triggerKey, trigger } = this.resolveTrigger(provider, event, providerObj.triggers ?? {});
    const normalizedHeaders = normalizeHeaders(headers);
    const signature = getSignature(provider, normalizedHeaders);
    const parsedPayload = payload ?? parseWebhookPayload(options.rawBody);
    const verificationContext: WebhookVerificationContext = {
      rawBody: options.rawBody,
      headers: normalizedHeaders,
    };

    const verifier = trigger.webhookConfig?.verifySignature;
    if (this.options.verifySignatures === true && !verifier) {
      throw new WebhookHandlerError(
        'WEBHOOK_SIGNATURE_REQUIRED',
        `signature verifier not configured for ${provider}.${triggerKey}`,
        500
      );
    }

    let verified = this.options.verifySignatures !== false;
    if (this.options.verifySignatures !== false && verifier) {
      if (!secret) {
        throw new WebhookHandlerError('WEBHOOK_SECRET_NOT_FOUND', `secret not configured for ${provider}`);
      }

      try {
        verified = await verifier(
          parsedPayload,
          signature,
          secret,
          verificationContext
        );
      } catch (error) {
        this.logger.error(`Webhook signature verification failed for ${provider}.${triggerKey}`, { error });
        throw new WebhookHandlerError('WEBHOOK_SIGNATURE_INVALID', 'signature verification failed');
      }

      if (!verified) {
        throw new WebhookHandlerError('WEBHOOK_SIGNATURE_INVALID', 'signature verification failed');
      }
    }

    const transformedPayload = trigger.webhookConfig?.transformPayload
      ? trigger.webhookConfig.transformPayload(parsedPayload)
      : parsedPayload;
    try {
      trigger.schema.parse(transformedPayload);
    } catch {
      throw new WebhookHandlerError('VALIDATION_ERROR', 'webhook payload validation failed');
    }

    return {
      triggerKey,
      trigger,
      transformedPayload,
      normalizedHeaders,
      signature,
      verified,
    };
  }

  on(provider: string, event: string, handler: TriggerHandler): void {
    const key = `${provider}:${event}`;

    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }

    this.handlers.get(key)!.add(handler);
    this.logger.debug(`Handler registered for ${provider}.${event}`);
  }

  off(provider: string, event: string, handler: TriggerHandler): void {
    const key = `${provider}:${event}`;
    const handlers = this.handlers.get(key);

    if (handlers) {
      handlers.delete(handler);

      if (handlers.size === 0) {
        this.handlers.delete(key);
      }
    }
  }

  getHandlerCount(provider?: string, event?: string): number {
    if (provider && event) {
      const key = `${provider}:${event}`;
      return this.handlers.get(key)?.size || 0;
    }

    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return total;
  }

  clearHandlers(): void {
    this.handlers.clear();
  }

  getProcessedEventCacheSize(): number {
    return this.processedEventIds.size;
  }

  private rememberProcessedEvent(idempotencyKey: string): void {
    this.processedEventIds.set(idempotencyKey, Date.now());
    if (this.processedEventIds.size <= this.maxProcessedEventIds) {
      return;
    }

    const overflow = this.processedEventIds.size - this.maxProcessedEventIds;
    const oldestKeys = [...this.processedEventIds.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, overflow)
      .map(([key]) => key);
    for (const key of oldestKeys) {
      this.processedEventIds.delete(key);
    }
  }

  private async emit(provider: string, event: string, webhookEvent: any): Promise<void> {
    const key = `${provider}:${event}`;
    const handlers = this.handlers.get(key);

    if (!handlers || handlers.size === 0) {
      this.logger.debug(`No handlers registered for ${provider}.${event}`);
      return;
    }

    const results = await Promise.allSettled(
      [...handlers].map((handler) => Promise.resolve().then(() => handler(webhookEvent)))
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    for (const failure of failures) {
      this.logger.error(`Handler error for ${provider}.${event}`, { error: failure.reason });
    }

    if (failures.length > 0) {
      throw new WebhookHandlerError(
        'WEBHOOK_HANDLER_FAILED',
        'webhook handler failed',
        503
      );
    }
  }

  private resolveTrigger(
    provider: string,
    incomingEvent: string,
    triggers: Record<string, any>
  ): { triggerKey: string; trigger: any } {
    const canonicalEvent = canonicalizeEvent(incomingEvent);
    const eventMap = new Map<string, string>();

    for (const [triggerKey, trigger] of Object.entries(triggers)) {
      const normalizedTriggerKey = canonicalizeEvent(triggerKey);
      setEventMapping(eventMap, normalizedTriggerKey, triggerKey);

      const path = trigger.webhookConfig?.path;
      if (typeof path === 'string' && path.length > 0) {
        const normalizedPathKey = canonicalizeEvent(path);
        setEventMapping(eventMap, normalizedPathKey, triggerKey);
        const routeSuffix = webhookRouteSuffix(provider, path);
        if (routeSuffix) {
          setEventMapping(eventMap, canonicalizeEvent(routeSuffix), triggerKey);
        }
      }
    }

    const resolvedTriggerKey = eventMap.get(canonicalEvent);
    if (!resolvedTriggerKey) {
      throw new WebhookHandlerError(
        'VALIDATION_ERROR',
        `unknown webhook event: ${provider}.${incomingEvent}`,
        404
      );
    }

    const trigger = triggers[resolvedTriggerKey];
    if (!trigger) {
      throw new WebhookHandlerError(
        'VALIDATION_ERROR',
        `Trigger ${resolvedTriggerKey} not found in provider ${provider}`,
        404
      );
    }

    return {
      triggerKey: resolvedTriggerKey,
      trigger,
    };
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

function setEventMapping(eventMap: Map<string, string>, canonicalEvent: string, triggerKey: string): void {
  const existing = eventMap.get(canonicalEvent);
  if (!existing) {
    eventMap.set(canonicalEvent, triggerKey);
  }
}

function canonicalizeEvent(event: string): string {
  const decodedEvent = decodeURIComponent(event);
  let start = 0;
  let end = decodedEvent.length;

  while (start < end && decodedEvent.charCodeAt(start) === 47) {
    start += 1;
  }
  while (end > start && decodedEvent.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return decodedEvent.slice(start, end).split('/').join('.').trim().toLowerCase();
}

function webhookRouteSuffix(provider: string, path: string): string | undefined {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = `/webhooks/${provider}/`;
  if (!normalizedPath.toLowerCase().startsWith(prefix.toLowerCase())) {
    return undefined;
  }

  const suffix = normalizedPath.slice(prefix.length);
  return suffix.length > 0 ? suffix : undefined;
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function getSignature(provider: string, headers: Record<string, string>): string {
  const providerHeaderCandidates: Record<string, string[]> = {
    stripe: ['stripe-signature'],
    github: ['x-hub-signature-256', 'x-hub-signature'],
    linear: ['linear-signature', 'x-linear-signature', 'x-signature'],
    clickup: ['x-signature', 'clickup-signature'],
    gmail: ['x-goog-signature-256', 'x-goog-signature', 'x-signature'],
    slack: ['x-slack-signature'],
  };

  const sharedCandidates = ['x-signature', 'x-hub-signature', 'x-hub-signature-256'];
  const candidates = [...(providerHeaderCandidates[provider] ?? []), ...sharedCandidates];

  for (const header of candidates) {
    const signature = headers[header];
    if (signature) {
      return signature;
    }
  }

  return '';
}

function parseWebhookPayload(rawBody?: Uint8Array): any {
  if (!rawBody || rawBody.byteLength === 0) {
    return {};
  }

  const rawText = new TextDecoder().decode(rawBody);
  if (rawText.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new WebhookHandlerError('VALIDATION_ERROR', 'invalid webhook payload', 400);
  }
}

function getEventId(payload: any, headers: Record<string, string>): string | undefined {
  const payloadId = payload && typeof payload === 'object' ? payload.id : undefined;
  if (typeof payloadId === 'string' && payloadId.length > 0) {
    return payloadId;
  }

  const headerCandidates = ['x-event-id', 'x-request-id', 'x-github-delivery', 'stripe-event-id'];
  for (const header of headerCandidates) {
    const value = headers[header];
    if (value) {
      return value;
    }
  }

  return undefined;
}
