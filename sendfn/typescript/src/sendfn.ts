import {
  SendfnConfig,
  SendEmailParams,
  EmailTransaction,
  SendSmsParams,
  SmsTransaction,
  SendWhatsAppParams,
  WhatsAppTransaction,
  SendPushParams,
  PushNotification,
  RegisterDeviceParams,
  DeviceToken,
  EmailTemplate,
  CommunicationEvent,
  SuppressionList,
  Platform,
  QueryEventsParams,
  SendfnClient,
  SuppressionCheckResult,
  AddSuppressionParams
} from './types';
import { SendfnDb, FindEventParams } from './database/sendfn-db';
import { EmailService } from './email/service';
import { AwsSesAdapter } from './email/aws-ses-adapter'; // Just for type or default? No, strictly DI now?
import type { EmailProvider } from './email/provider';
import { TemplateEngine, TemplateRegistry } from './templates/engine';
import { PushService } from './push/service';
import { FcmProvider } from './push/fcm';
import { ApnsProvider } from './push/apns';
import type { PushProvider } from './push/provider';
import { SmsService } from './sms/service';
import type { SmsProvider } from './sms/provider';
import { WhatsAppService } from './whatsapp/service';
import type { WhatsAppProvider } from './whatsapp/provider';
import { DeviceTokenManager } from './push/device-manager';
import { EventTracker } from './events/tracker';
import { SuppressionManager } from './suppression/manager';
import { AwsSesWebhookHandler } from './events/webhook-handler';
import { welcomeEmailTemplate, passwordResetTemplate, notificationTemplate } from './templates/defaults';
import { createRouter } from '@superfunctions/http';
import { wrapWithSchema, type Adapter } from '@superfunctions/db';
import { randomUUID } from 'node:crypto';
import { getSchema } from './schema';
import {
  DatabaseError,
  EmailProviderError,
  PushProviderError,
  SendfnError,
  SmsProviderError,
  SuppressionError,
  TemplateError,
  ValidationError,
  WhatsAppProviderError,
} from './errors';

type SendfnErrorConstructor = new (message: string, options?: { cause?: unknown }) => SendfnError;

interface CanonicalMeta {
  requestId: string;
  version: 'v0';
}

const SUPPORTED_PUSH_PLATFORMS = ['ios', 'android', 'web'] as const;

function isPlatform(value: string): value is Platform {
  return (SUPPORTED_PUSH_PLATFORMS as readonly string[]).includes(value);
}

function createRequestId(request: Request): string {
  return request.headers.get('x-request-id') ?? `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function trackInitialization(initialization: Promise<void>): Promise<void> {
  void initialization.catch(() => undefined);
  return initialization;
}

function buildSuccessResponse(data: unknown, requestId: string, status = 200): Response {
  return Response.json(
    {
      ok: true,
      data,
      error: null,
      meta: {
        requestId,
        version: 'v0',
      } satisfies CanonicalMeta,
    },
    { status }
  );
}

function buildErrorResponse(
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  },
  requestId: string,
  status: number
): Response {
  return Response.json(
    {
      ok: false,
      data: null,
      error,
      meta: {
        requestId,
        version: 'v0',
      } satisfies CanonicalMeta,
    },
    { status }
  );
}

export class Sendfn implements SendfnClient {
  private emailService?: EmailService;
  private smsService?: SmsService;
  private whatsappService?: WhatsAppService;
  private pushService: PushService;
  private eventTracker: EventTracker;
  private suppressionManager: SuppressionManager;
  private templateRegistry: TemplateRegistry;
  private deviceManager: DeviceTokenManager;
  private awsSesWebhookHandler: AwsSesWebhookHandler;
  private db: SendfnDb;
  private databaseAdapter: Adapter;
  private emailProvider?: EmailProvider;
  private smsProvider?: SmsProvider;
  private whatsappProvider?: WhatsAppProvider;
  private pushProviders = new Map<Platform, PushProvider>();
  private emailInitialization: Promise<void> = Promise.resolve();
  private smsInitialization: Promise<void> = Promise.resolve();
  private whatsappInitialization: Promise<void> = Promise.resolve();
  private pushInitialization: Promise<void> = Promise.resolve();
  private closed = false;

  public router: any;

  constructor(private config: SendfnConfig) {
    const configuredPushProviders = config.pushProviders ?? {};
    const unsupportedPushPlatforms = Object.keys(configuredPushProviders).filter(
      (platform) => !isPlatform(platform)
    );
    if (unsupportedPushPlatforms.length > 0) {
      throw new ValidationError(
        `Unsupported push provider platform${unsupportedPushPlatforms.length === 1 ? '' : 's'}: ${unsupportedPushPlatforms.join(', ')}`
      );
    }

    // Initialize Database Wrapper
    this.databaseAdapter = config.database;
    this.db = new SendfnDb(wrapWithSchema(config.database, getSchema()));

    // Dependencies
    const templateEngine = new TemplateEngine();
    this.templateRegistry = new TemplateRegistry();

    // Register default templates
    this.templateRegistry.register(welcomeEmailTemplate);
    this.templateRegistry.register(passwordResetTemplate);
    this.templateRegistry.register(notificationTemplate);

    this.suppressionManager = new SuppressionManager(this.db, {
        enabled: config.options?.suppressionEnabled ?? true
    });

    this.eventTracker = new EventTracker(this.db);

    this.deviceManager = new DeviceTokenManager(this.db);

    // Initialize Email Service if Provider is provided
    if (config.emailProvider) {
        this.emailProvider = config.emailProvider;
        this.emailInitialization = trackInitialization(config.emailProvider.initialize());

        this.emailService = new EmailService(
            config.emailProvider,
            this.db,
            templateEngine,
            this.templateRegistry,
            config.email || { fromEmail: 'noreply@example.com' } as any, // Only need config if we use defaults inside service
            config.options || {}
        );
    } else if (config.email?.awsSes) {
        // Backwards compatibility / ease of use: if awsSes config present but no provider passed, create default
        const provider = new AwsSesAdapter(config.email.awsSes);
        this.emailProvider = provider;
        this.emailInitialization = trackInitialization(provider.initialize());
        this.emailService = new EmailService(
            provider,
            this.db,
            templateEngine,
            this.templateRegistry,
            config.email,
            config.options || {}
        );
    }

    // Initialize SMS Service if Provider is provided
    if (config.smsProvider) {
        this.smsProvider = config.smsProvider;
        this.smsInitialization = trackInitialization(config.smsProvider.initialize());

        this.smsService = new SmsService(
            config.smsProvider,
            this.db,
            config.options || {}
        );
    }

    // Initialize WhatsApp Service if Provider is provided
    if (config.whatsappProvider) {
        this.whatsappProvider = config.whatsappProvider;
        this.whatsappInitialization = trackInitialization(config.whatsappProvider.initialize());

        this.whatsappService = new WhatsAppService(
            config.whatsappProvider,
            this.db,
            config.options || {}
        );
    }

    // Initialize Push Providers
    const pushProvidersToInitialize = new Map<Platform, PushProvider>();

    for (const platform of SUPPORTED_PUSH_PLATFORMS) {
        const provider = configuredPushProviders[platform];
        if (provider) {
            pushProvidersToInitialize.set(platform, provider);
        }
    }

    if (config.push?.providers.fcm && (!pushProvidersToInitialize.has('android') || !pushProvidersToInitialize.has('web'))) {
        const fcmProvider = new FcmProvider(config.push.providers.fcm);
        if (!pushProvidersToInitialize.has('android')) {
          pushProvidersToInitialize.set('android', fcmProvider);
        }
        if (!pushProvidersToInitialize.has('web')) {
          pushProvidersToInitialize.set('web', fcmProvider);
        }
    }
    if (!pushProvidersToInitialize.has('ios') && config.push?.providers.apns) {
        pushProvidersToInitialize.set('ios', new ApnsProvider(config.push.providers.apns));
    }

    for (const [platform, provider] of pushProvidersToInitialize) {
        this.pushProviders.set(platform, provider);
    }
    this.pushInitialization = trackInitialization(Promise.all(
      [...new Set(pushProvidersToInitialize.values())].map((provider) => provider.initialize())
    ).then(() => undefined));

    this.pushService = new PushService(
        this.pushProviders,
        this.db,
        this.deviceManager,
        config.options || {}
    );

    this.awsSesWebhookHandler = new AwsSesWebhookHandler(
        this.db,
        this.suppressionManager,
        {
          logger: this.config.options?.logger,
          verifier: this.config.awsSns
            ? AwsSesWebhookHandler.createVerifier({
                topicArns: this.config.awsSns.topicArns,
                maxAgeMs: this.config.awsSns.maxAgeMs,
              })
            : undefined,
        }
    );

    if (config.enableApi) {
        this.initializeRouter();
    }
  }

  private initializeRouter() {
      const adminKey = this.config.apiConfig?.adminKey;
      const adminAuthMiddleware = async (req: Request, _ctx: any, next: () => Promise<Response>) => {
          const requestId = createRequestId(req);
          const authHeader = req.headers.get('authorization');
          const token = authHeader?.replace(/^Bearer\s+/i, '');

          if (!adminKey || token !== adminKey) {
              return buildErrorResponse(
                {
                  code: 'SENDFN_UNAUTHORIZED',
                  message: 'Unauthorized',
                  retryable: false,
                },
                requestId,
                401
              );
          }

          return next();
      };

      const withEnvelope = async <T>(
        req: Request,
        operation: () => Promise<T>,
        options: { successStatus?: number; validationMessage?: string; requestId?: string } = {}
      ): Promise<Response> => {
        const requestId = options.requestId ?? createRequestId(req);

        try {
          const data = await operation();
          return buildSuccessResponse(data, requestId, options.successStatus ?? 200);
        } catch (error) {
          if (error instanceof ValidationError) {
            return buildErrorResponse(
              {
                code: error.code,
                message: options.validationMessage ?? 'Request body failed validation',
                retryable: error.retryable,
                details: error.details,
              },
              requestId,
              400
            );
          }

          if (error instanceof SendfnError) {
            const status =
              error.code === 'SENDFN_UNAUTHORIZED'
                ? 401
                : error.code === 'SENDFN_WEBHOOK_SIGNATURE_INVALID' || error.code === 'SENDFN_WEBHOOK_MESSAGE_INVALID'
                  ? 400
                  : error.code === 'SENDFN_VALIDATION_ERROR'
                    ? 400
                    : 500;

            return buildErrorResponse(
              {
                code: error.code,
                message: error.code === 'SENDFN_VALIDATION_ERROR'
                  ? options.validationMessage ?? 'Request body failed validation'
                  : error.message,
                retryable: error.retryable,
                details: error.details,
              },
              requestId,
              status
            );
          }

          return buildErrorResponse(
            {
              code: 'SENDFN_INTERNAL_ERROR',
              message: 'Internal Server Error',
              retryable: false,
            },
            requestId,
            500
          );
        }
      };

      const adminRouteMiddleware = [adminAuthMiddleware];

      this.router = createRouter({
          routes: [
              // POST /email
              {
                  method: 'POST',
                  path: '/email',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(
                      req,
                      async () => this.email(await ctx.json()),
                      { successStatus: 201, validationMessage: 'Request body failed validation' }
                    )
              },
              // POST /sms
              {
                  method: 'POST',
                  path: '/sms',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(
                      req,
                      async () => this.sms(await ctx.json()),
                      { successStatus: 201, validationMessage: 'Request body failed validation' }
                    )
              },
              // POST /whatsapp
              {
                  method: 'POST',
                  path: '/whatsapp',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(
                      req,
                      async () => this.whatsapp(await ctx.json()),
                      { successStatus: 201, validationMessage: 'Request body failed validation' }
                    )
              },
              // POST /push
              {
                  method: 'POST',
                  path: '/push',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(
                      req,
                      async () => this.push(await ctx.json()),
                      { successStatus: 201, validationMessage: 'Request body failed validation' }
                    )
              },
              // POST /devices
              {
                  method: 'POST',
                  path: '/devices',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(
                      req,
                      async () => this.registerDevice(await ctx.json()),
                      { successStatus: 201, validationMessage: 'Request body failed validation' }
                    )
              },
              // GET /devices?userId=...&platform=...
              {
                  method: 'GET',
                  path: '/devices',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(req, async () => {
                      const userId = ctx.query.get('userId');
                      const platform = ctx.query.get('platform');

                      if (!userId?.trim()) {
                        throw new ValidationError('`userId` query parameter is required');
                      }

                      if (platform !== null && !isPlatform(platform)) {
                        throw new ValidationError('`platform` must be ios, android, or web');
                      }

                      return {
                        devices: await this.getDevices(userId.trim(), platform ?? undefined),
                      };
                    }, { validationMessage: 'Request query failed validation' })
              },
              // POST /devices/refresh
              {
                  method: 'POST',
                  path: '/devices/refresh',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(
                      req,
                      async () => {
                        let body: unknown;
                        try {
                          body = await ctx.json();
                        } catch {
                          throw new ValidationError('Request body must be valid JSON');
                        }

                        if (!body || typeof body !== 'object' || Array.isArray(body)) {
                          throw new ValidationError('Request body must be a JSON object');
                        }

                        const refresh = body as Record<string, unknown>;
                        return this.refreshDeviceToken(
                          refresh.oldToken as string,
                          refresh.newToken as string,
                          refresh.userId as string,
                          refresh.platform as Platform
                        );
                      },
                      { validationMessage: 'Request body failed validation' }
                    )
              },
              // DELETE /devices?token=...
              {
                  method: 'DELETE',
                  path: '/devices',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(req, async () => {
                      const token = ctx.query.get('token');

                      if (!token) {
                        throw new ValidationError('`token` query parameter is required');
                      }

                      await this.deactivateDevice(token);
                      return { deactivated: true };
                    }, { validationMessage: 'Request query failed validation' })
              },
              // GET /events
              {
                  method: 'GET',
                  path: '/events',
                  middleware: adminRouteMiddleware,
                  handler: async (req: Request, ctx: any) =>
                    withEnvelope(req, async () => {
                      const params = {
                          referenceId: ctx.query.get('referenceId') || undefined,
                          referenceType: ctx.query.get('referenceType') as any || undefined,
                          providerMessageId: ctx.query.get('providerMessageId') || undefined,
                          provider: ctx.query.get('provider') || undefined,
                          userId: ctx.query.get('userId') || undefined,
                          eventType: ctx.query.get('eventType') || undefined,
                          startAt: ctx.query.get('startAt') ? new Date(ctx.query.get('startAt')) : undefined,
                          endAt: ctx.query.get('endAt') ? new Date(ctx.query.get('endAt')) : undefined,
                          limit: ctx.query.get('limit') ? Number(ctx.query.get('limit')) : undefined,
                          offset: ctx.query.get('offset') ? Number(ctx.query.get('offset')) : undefined,
                      };
                      return { events: await this.queryEvents(params) };
                    })
              },
              ...(this.hasAuthorizedAwsSnsTopics() ? [{
                  method: 'POST' as const,
                  path: '/webhooks/aws-ses',
                  handler: async (req: Request, ctx: any) => {
                    const requestId = createRequestId(req);
                    return withEnvelope(
                      req,
                      async () =>
                        this.awsSesWebhookHandler.handleSnsNotification(await ctx.json(), {
                          requestId,
                        }),
                      { requestId }
                    );
                  }
              }] : [])
          ]
      });
  }

  private async withTypedError<T>(
    operation: () => Promise<T>,
    ErrorClass: SendfnErrorConstructor
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SendfnError) {
        throw error;
      }

      throw new ErrorClass(
        error instanceof Error ? error.message : 'Unexpected sendfn error',
        { cause: error }
      );
    }
  }

  // Email methods
  async email(params: SendEmailParams): Promise<EmailTransaction> {
    if (!this.emailService) {
        throw new EmailProviderError("Email provider not configured");
    }
    return this.withTypedError(async () => {
      await this.emailInitialization;
      return this.emailService!.sendEmail(params);
    }, EmailProviderError);
  }

  async bulkEmail(recipients: SendEmailParams[]): Promise<EmailTransaction[]> {
    if (!this.emailService) {
        throw new EmailProviderError("Email provider not configured");
    }
    return this.withTypedError(async () => {
      await this.emailInitialization;
      return this.emailService!.sendBulkEmail(recipients);
    }, EmailProviderError);
  }

  // SMS methods
  async sms(params: SendSmsParams): Promise<SmsTransaction> {
      if (!this.smsService) {
          throw new SmsProviderError("SMS provider not configured");
      }
      return this.withTypedError(async () => {
        await this.smsInitialization;
        return this.smsService!.sendSms(params);
      }, SmsProviderError);
  }

  // WhatsApp methods
  async whatsapp(params: SendWhatsAppParams): Promise<WhatsAppTransaction> {
      if (!this.whatsappService) {
          throw new WhatsAppProviderError("WhatsApp provider not configured");
      }
      return this.withTypedError(async () => {
        await this.whatsappInitialization;
        return this.whatsappService!.sendWhatsApp(params);
      }, WhatsAppProviderError);
  }

  // Push methods
  async push(params: SendPushParams): Promise<PushNotification> {
    return this.withTypedError(async () => {
      await this.pushInitialization;
      return this.pushService.sendPush(params);
    }, PushProviderError);
  }

  async bulkPush(notifications: SendPushParams[]): Promise<PushNotification[]> {
    return this.withTypedError(async () => {
      await this.pushInitialization;
      return this.pushService.sendBulkPush(notifications);
    }, PushProviderError);
  }

  // Device management
  async registerDevice(params: RegisterDeviceParams): Promise<DeviceToken> {
    return this.withTypedError(() => this.deviceManager.registerDevice(params), DatabaseError);
  }

  async getDevices(
    userId: string,
    platform?: Platform
  ): Promise<DeviceToken[]> {
    return this.withTypedError(() => this.deviceManager.getActiveDevices(userId, platform), DatabaseError);
  }

  async deactivateDevice(token: string): Promise<void> {
    return this.withTypedError(() => this.deviceManager.deactivateTokens([token]), DatabaseError);
  }

  async refreshDeviceToken(
    oldToken: string,
    newToken: string,
    userId: string,
    platform: Platform
  ): Promise<DeviceToken> {
    return this.withTypedError(
      () => this.deviceManager.refreshDeviceToken(oldToken, newToken, userId, platform),
      DatabaseError
    );
  }

  async cleanupInactiveDevices(olderThan: Date): Promise<number> {
    return this.withTypedError(
      () => this.deviceManager.cleanupInactiveDevices(olderThan),
      DatabaseError
    );
  }

  // Template management
  async registerTemplate(template: EmailTemplate): Promise<void> {
    try {
      this.templateRegistry.register(template);
    } catch (error) {
      if (error instanceof SendfnError) {
        throw error;
      }
      throw new TemplateError(
        error instanceof Error ? error.message : 'Unexpected template error',
        { cause: error }
      );
    }
  }

  async getTemplate(templateId: string): Promise<EmailTemplate | undefined> {
    return this.templateRegistry.get(templateId);
  }

  async listTemplates(): Promise<EmailTemplate[]> {
    return this.templateRegistry.list();
  }

  // Event queries
  async getEmailEvents(transactionId: string): Promise<CommunicationEvent[]> {
    return this.withTypedError(() => this.eventTracker.getEvents(transactionId, "email"), DatabaseError);
  }

  async getPushEvents(notificationId: string): Promise<CommunicationEvent[]> {
    return this.withTypedError(() => this.eventTracker.getEvents(notificationId, "push"), DatabaseError);
  }

  async getSmsEvents(transactionId: string): Promise<CommunicationEvent[]> {
      return this.withTypedError(() => this.eventTracker.getEvents(transactionId, "sms"), DatabaseError);
  }

  async getWhatsAppEvents(transactionId: string): Promise<CommunicationEvent[]> {
      return this.withTypedError(() => this.eventTracker.getEvents(transactionId, "whatsapp"), DatabaseError);
  }

  async queryEvents(params: QueryEventsParams): Promise<CommunicationEvent[]> {
    return this.withTypedError(
      () => this.eventTracker.queryEvents(params as FindEventParams),
      DatabaseError
    );
  }

  // Suppression management
  async checkSuppressionList(email: string): Promise<SuppressionCheckResult> {
    return this.withTypedError(() => this.suppressionManager.checkSuppression(email), SuppressionError);
  }

  async addToSuppressionList(
    params: AddSuppressionParams
  ): Promise<SuppressionList> {
    return this.withTypedError(() => this.suppressionManager.addToSuppressionList(params), SuppressionError);
  }

  async bulkAddToSuppressionList(entries: AddSuppressionParams[]): Promise<void> {
    return this.withTypedError(
      () => this.suppressionManager.bulkAddToSuppressionList(entries),
      SuppressionError
    );
  }

  async exportSuppressionList(limit = 1000, offset = 0): Promise<SuppressionList[]> {
    return this.withTypedError(
      () => this.suppressionManager.exportSuppressionList(limit, offset),
      SuppressionError
    );
  }

  async removeFromSuppressionList(email: string): Promise<void> {
    return this.withTypedError(() => this.suppressionManager.removeFromSuppressionList(email), SuppressionError);
  }

  // Webhooks
  getWebhookHandlers() {
    if (!this.hasAuthorizedAwsSnsTopics()) {
      throw new ValidationError('Configure at least one `awsSns.topicArns` entry before exposing AWS SES webhooks');
    }
    return {
      awsSes: this.awsSesWebhookHandler,
    };
  }

  private hasAuthorizedAwsSnsTopics(): boolean {
    return this.config.awsSns?.topicArns.some((topicArn) => typeof topicArn === 'string' && topicArn.trim().length > 0) === true;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    const resources = new Set<{
      close?: () => Promise<void>;
    }>();

    if (this.emailProvider) {
      resources.add(this.emailProvider);
    }
    if (this.smsProvider) {
      resources.add(this.smsProvider);
    }
    if (this.whatsappProvider) {
      resources.add(this.whatsappProvider);
    }
    for (const provider of this.pushProviders.values()) {
      resources.add(provider);
    }
    resources.add(this.databaseAdapter);

    for (const resource of resources) {
      if (typeof resource.close === 'function') {
        await resource.close();
      } else if ('$disconnect' in resource && typeof resource.$disconnect === 'function') {
        await resource.$disconnect();
      }
    }

    this.closed = true;
  }
}

export function createSendFn(config: SendfnConfig): Sendfn {
  return new Sendfn(config);
}

export function sendFn(config: SendfnConfig): Sendfn {
  return createSendFn(config);
}

export function sendfn(config: SendfnConfig): Sendfn {
  return createSendFn(config);
}
