import type { TableSchema } from '@superfunctions/db';

export const SENDFN_SCHEMA_VERSION = 2;

export interface SendfnSchemaOptions {
  namespace?: string;
}

export interface SendFnSchemaDefinition {
  version: number;
  schemas: TableSchema[];
}

export function getSendFnSchema(_options: SendfnSchemaOptions = {}): TableSchema[] {
  return withDateDefaults([
    {
      modelName: 'email_transactions',
      fields: {
        id: { type: 'string', required: true },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        to: { type: 'json', required: true },
        from: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        templateId: { type: 'string', required: false, fieldName: 'template_id' },
        templateData: { type: 'json', required: false, fieldName: 'template_data' },
        provider: { type: 'string', required: true },
        providerMessageId: { type: 'string', required: false, fieldName: 'provider_message_id' },
        status: { type: 'string', required: true },
        sentAt: { type: 'date', required: false, fieldName: 'sent_at' },
        deliveredAt: { type: 'date', required: false, fieldName: 'delivered_at' },
        bouncedAt: { type: 'date', required: false, fieldName: 'bounced_at' },
        complainedAt: { type: 'date', required: false, fieldName: 'complained_at' },
        metadata: { type: 'json', required: true },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' },
      },
      indexes: [
        { name: 'idx_sendfn_email_transactions_user', fields: ['userId'] },
        { name: 'idx_sendfn_email_transactions_status', fields: ['status'] },
        { name: 'idx_sendfn_email_transactions_provider_message', fields: ['providerMessageId'] },
        { name: 'idx_sendfn_email_transactions_created', fields: ['createdAt'] },
      ],
    },
    {
      modelName: 'sms_transactions',
      fields: {
        id: { type: 'string', required: true },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        to: { type: 'string', required: true },
        message: { type: 'string', required: true },
        provider: { type: 'string', required: true },
        providerMessageId: { type: 'string', required: false, fieldName: 'provider_message_id' },
        status: { type: 'string', required: true },
        sentAt: { type: 'date', required: false, fieldName: 'sent_at' },
        metadata: { type: 'json', required: true },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' },
      },
      indexes: [
        { name: 'idx_sendfn_sms_transactions_user', fields: ['userId'] },
        { name: 'idx_sendfn_sms_transactions_status', fields: ['status'] },
        { name: 'idx_sendfn_sms_transactions_provider_message', fields: ['providerMessageId'] },
        { name: 'idx_sendfn_sms_transactions_created', fields: ['createdAt'] },
      ],
    },
    {
      modelName: 'whatsapp_transactions',
      fields: {
        id: { type: 'string', required: true },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        to: { type: 'string', required: true },
        message: { type: 'string', required: true },
        provider: { type: 'string', required: true },
        providerMessageId: { type: 'string', required: false, fieldName: 'provider_message_id' },
        status: { type: 'string', required: true },
        sentAt: { type: 'date', required: false, fieldName: 'sent_at' },
        metadata: { type: 'json', required: true },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' },
      },
      indexes: [
        { name: 'idx_sendfn_whatsapp_transactions_user', fields: ['userId'] },
        { name: 'idx_sendfn_whatsapp_transactions_status', fields: ['status'] },
        { name: 'idx_sendfn_whatsapp_transactions_provider_message', fields: ['providerMessageId'] },
        { name: 'idx_sendfn_whatsapp_transactions_created', fields: ['createdAt'] },
      ],
    },
    {
      modelName: 'push_notifications',
      fields: {
        id: { type: 'string', required: true },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        title: { type: 'string', required: true },
        body: { type: 'string', required: true },
        data: { type: 'json', required: false },
        deviceTokens: { type: 'json', required: true, fieldName: 'device_tokens' },
        platform: { type: 'string', required: true },
        provider: { type: 'string', required: true },
        status: { type: 'string', required: true },
        sentCount: { type: 'number', required: true, fieldName: 'sent_count', defaultValue: 0 },
        failedCount: { type: 'number', required: true, fieldName: 'failed_count', defaultValue: 0 },
        sentAt: { type: 'date', required: false, fieldName: 'sent_at' },
        metadata: { type: 'json', required: true },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' },
      },
      indexes: [
        { name: 'idx_sendfn_push_notifications_user', fields: ['userId'] },
        { name: 'idx_sendfn_push_notifications_status', fields: ['status'] },
        { name: 'idx_sendfn_push_notifications_created', fields: ['createdAt'] },
      ],
    },
    {
      modelName: 'device_tokens',
      fields: {
        id: { type: 'string', required: true },
        userId: { type: 'string', required: true, fieldName: 'user_id' },
        token: { type: 'string', required: true },
        platform: { type: 'string', required: true },
        appVersion: { type: 'string', required: false, fieldName: 'app_version' },
        deviceInfo: { type: 'json', required: false, fieldName: 'device_info' },
        isActive: { type: 'boolean', required: true, fieldName: 'is_active', defaultValue: true },
        lastUsedAt: { type: 'date', required: true, fieldName: 'last_used_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' },
      },
      indexes: [
        { name: 'idx_sendfn_device_tokens_user', fields: ['userId'] },
        { name: 'idx_sendfn_device_tokens_token', fields: ['token'] },
        { name: 'idx_sendfn_device_tokens_platform', fields: ['platform'] },
        { name: 'idx_sendfn_device_tokens_active', fields: ['isActive'] },
        { name: 'idx_sendfn_device_tokens_user_token_platform', fields: ['userId', 'token', 'platform'], unique: true },
      ],
    },
    {
      modelName: 'suppression_list',
      fields: {
        id: { type: 'string', required: true },
        email: { type: 'string', required: true, unique: true },
        reason: { type: 'string', required: true },
        source: { type: 'string', required: true },
        bounceType: { type: 'string', required: false, fieldName: 'bounce_type' },
        metadata: { type: 'json', required: true },
        suppressedAt: { type: 'date', required: true, fieldName: 'suppressed_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
      },
      indexes: [
        { name: 'idx_sendfn_suppression_list_email', fields: ['email'], unique: true },
        { name: 'idx_sendfn_suppression_list_reason', fields: ['reason'] },
      ],
    },
    {
      modelName: 'communication_events',
      fields: {
        id: { type: 'string', required: true },
        referenceId: { type: 'string', required: true, fieldName: 'reference_id' },
        referenceType: { type: 'string', required: true, fieldName: 'reference_type' },
        eventType: { type: 'string', required: true, fieldName: 'event_type' },
        provider: { type: 'string', required: true },
        providerEventId: { type: 'string', required: false, fieldName: 'provider_event_id' },
        recipientEmail: { type: 'string', required: false, fieldName: 'recipient_email' },
        recipientPhone: { type: 'string', required: false, fieldName: 'recipient_phone' },
        deviceToken: { type: 'string', required: false, fieldName: 'device_token' },
        metadata: { type: 'json', required: true },
        eventTimestamp: { type: 'date', required: true, fieldName: 'event_timestamp' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
      },
      indexes: [
        { name: 'idx_sendfn_communication_events_reference', fields: ['referenceId', 'referenceType'] },
        { name: 'idx_sendfn_communication_events_provider', fields: ['provider'] },
        { name: 'idx_sendfn_communication_events_type', fields: ['eventType'] },
        { name: 'idx_sendfn_communication_events_provider_event', fields: ['providerEventId'] },
        { name: 'idx_sendfn_communication_events_timestamp', fields: ['eventTimestamp'] },
        { name: 'idx_sendfn_communication_events_recipient_email', fields: ['recipientEmail'] },
      ],
    },
  ]);
}

export function getSchema(options: SendfnSchemaOptions = {}): SendFnSchemaDefinition {
  return {
    version: SENDFN_SCHEMA_VERSION,
    schemas: getSendFnSchema(options),
  };
}

function withDateDefaults(tables: TableSchema[]): TableSchema[] {
  return tables.map((table) => ({
    ...table,
    fields: Object.fromEntries(
      Object.entries(table.fields).map(([name, field]) => [
        name,
        field.type === 'date' || field.type === 'datetime'
          ? {
              dateValueType: 'date',
              dateStorageType: 'timestamptz',
              ...field,
            }
          : field,
      ])
    ),
  }));
}
