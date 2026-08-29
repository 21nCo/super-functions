// Main exports
export { Sendfn, createSendFn, sendFn, sendfn } from './sendfn';
export {
  createSendFnDeliveryProvider,
  type SendFnDeliveryProviderOptions,
  type SendFnDeliveryRenderer,
  type SendFnEmailClient
} from './delivery';
export { SENDFN_SCHEMA_VERSION, getSchema, getSendFnSchema } from './schema';
export type { SendFnSchemaDefinition, SendfnSchemaOptions } from './schema';

// Types
export * from './types';

// Errors
export * from './errors';

// Database adapter
export { SendfnDatabaseAdapter } from './database/adapter';

// Webhook handlers
export { AwsSesWebhookHandler } from './events/webhook-handler';

// Template defaults
export * from './templates/defaults';

// Adapters & Providers
export { AwsSesAdapter, awsSesAdapter } from './email/aws-ses-adapter';
export { ResendAdapter, resendAdapter } from './email/resend-adapter';
export type { EmailProvider } from './email/provider';
export { ConsoleSmsAdapter, consoleSmsAdapter } from './sms/console-adapter';
export type { SmsProvider } from './sms/provider';
export type { WhatsAppProvider } from './whatsapp/provider';
export type { PushProvider } from './push/provider';
